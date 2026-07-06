// Defensive validation for rule packs the extension did not bundle itself
// (fetched over the network for self-updates). Pure functions, no extension
// APIs, shared with the unit tests. A pack that fails validation is rejected
// outright; malformed entries inside an otherwise-sane pack are dropped.
//
// Caps bound the blast radius of a compromised or corrupted source: the
// extension will never compile more DNR rules than these limits allow.

export const LIMITS = {
  maxPolicies: 20,
  maxServices: 500,
  maxDomainsPerService: 50,
  maxTotalDomains: 2000,
}

// A validated pack compiles to well under this size; the bundled copy is ~15 KB.
// Bodies larger than this are refused before parsing so a compromised or
// misconfigured source cannot exhaust the worker's memory with a giant payload.
export const MAX_PACK_BYTES = 1_000_000

const DOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/

// Canonicalizes user- or network-supplied text into a bare lowercase domain,
// or returns null when it cannot be one.
export function toValidDomain(value) {
  if (typeof value !== 'string') {
    return null
  }

  let text = value.trim().toLowerCase()
  if (!text || text.length > 253) {
    return null
  }

  text = text.replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
  text = text.split(/[/?#]/)[0]
  text = text.replace(/^www\./, '')
  text = text.split('@').pop() ?? ''
  text = text.split(':')[0] ?? ''

  return DOMAIN_PATTERN.test(text) ? text : null
}

function sanitizeString(value, maxLength = 200) {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength ? value : null
}

function sanitizePolicy(raw) {
  if (!raw || typeof raw !== 'object') {
    return null
  }

  const id = sanitizeString(raw.id, 60)
  const name = sanitizeString(raw.name, 80)
  const tagline = sanitizeString(raw.tagline, 200) ?? ''

  if (!id || !name || !Array.isArray(raw.block) || typeof raw.strict !== 'boolean') {
    return null
  }

  const block = raw.block.filter((entry) => typeof entry === 'string' && entry.length <= 40)

  return { id, name, tagline, block, strict: raw.strict }
}

function sanitizeService(raw, remainingDomainBudget) {
  if (!raw || typeof raw !== 'object') {
    return null
  }

  const name = sanitizeString(raw.name, 120)
  const category = sanitizeString(raw.category, 40)

  if (!name || !category || !Array.isArray(raw.domains)) {
    return null
  }

  const domains = []
  for (const entry of raw.domains.slice(0, LIMITS.maxDomainsPerService)) {
    const domain = toValidDomain(entry)
    if (domain && !domains.includes(domain) && domains.length < remainingDomainBudget) {
      domains.push(domain)
    }
  }

  if (domains.length === 0) {
    return null
  }

  return { name, category, domains, strictOnly: raw.strictOnly === true }
}

// Returns a sanitized pack, or null when the input is not usable at all.
// Never throws on any input.
export function sanitizePack(raw) {
  if (!raw || typeof raw !== 'object') {
    return null
  }

  const version = sanitizeString(raw.version, 40)
  const updatedAt = sanitizeString(raw.updatedAt, 40) ?? ''

  if (!version || !Array.isArray(raw.policies) || !Array.isArray(raw.services)) {
    return null
  }

  const policies = raw.policies.slice(0, LIMITS.maxPolicies).map(sanitizePolicy).filter(Boolean)

  let domainBudget = LIMITS.maxTotalDomains
  const services = []
  for (const entry of raw.services.slice(0, LIMITS.maxServices)) {
    const service = sanitizeService(entry, domainBudget)
    if (service) {
      domainBudget -= service.domains.length
      services.push(service)
    }
    if (domainBudget <= 0) {
      break
    }
  }

  if (policies.length === 0 || services.length === 0) {
    return null
  }

  return { version, updatedAt, policies, services }
}

// True when `candidate` is safe to accept over `current` — i.e. newer or equal.
// An empty/missing current version accepts anything (first fetch). Pack versions
// are zero-padded date strings (e.g. "2026.06.11"), so a lexical compare orders
// them chronologically and rejects downgrades from a compromised source.
export function isAcceptableVersion(candidate, current) {
  if (!current) {
    return true
  }
  if (!candidate) {
    return false
  }
  return candidate.localeCompare(current) >= 0
}

// Reads a fetch Response body as text without ever buffering more than
// maxBytes. It trusts neither the Content-Length header nor the server's
// honesty: an oversized declared length is rejected up front, and the streamed
// bytes are counted so a lying or chunked response is abandoned mid-flight.
// Returns the text, or null when the body is too large or unreadable.
export async function readCappedText(response, maxBytes = MAX_PACK_BYTES) {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) {
    return null
  }

  const reader = response.body?.getReader?.()
  if (!reader) {
    // No streaming body available — fall back to a bounded text read.
    const text = await response.text()
    return text.length > maxBytes ? null : text
  }

  const decoder = new TextDecoder()
  let text = ''
  let total = 0

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        return null
      }
      text += decoder.decode(value, { stream: true })
    }
  } finally {
    reader.releaseLock()
  }

  return text + decoder.decode()
}

// Fetches, size-caps, and structure-validates a pack in one step. Returns a
// sanitized pack, or null on any failure (network, non-2xx, oversized body,
// bad JSON, or invalid shape) so callers can simply keep their current pack.
export async function fetchValidatedPack(url) {
  const response = await fetch(url, { cache: 'no-cache' })
  if (!response.ok) {
    return null
  }

  const text = await readCappedText(response)
  if (text === null) {
    return null
  }

  try {
    return sanitizePack(JSON.parse(text))
  } catch {
    return null
  }
}
