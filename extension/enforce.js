// The enforcement brain, shared by the background service worker and the unit
// tests. Pure functions, no extension APIs — given the rule pack and the user's
// state, it decides which domains to block and compiles declarativeNetRequest
// (DNR) rules. This mirrors the web app's resolveRules so web, exports and the
// extension can never disagree.

export const RESOURCE_TYPES = [
  'main_frame',
  'sub_frame',
  'stylesheet',
  'script',
  'image',
  'font',
  'object',
  'xmlhttprequest',
  'ping',
  'csp_report',
  'media',
  'websocket',
  'other',
]

const STRICT_NO_AI = 'strict-no-ai'

function findPolicy(pack, activePolicyId) {
  return (
    pack.policies.find((policy) => policy.id === activePolicyId) ??
    pack.policies.find((policy) => policy.id === STRICT_NO_AI) ??
    null
  )
}

// Resolves the effective allow/block domain sets for the current state. A
// policy lists the categories it blocks; strict mode additionally pulls in
// strict-only services. User allow-exceptions always win, so a domain never
// appears in both lists.
export function resolveBlockedDomains(pack, state = {}) {
  const allowDomains = unique(state.allowDomains)
  const allowSet = new Set(allowDomains)

  // Paused: enforce nothing, but still honour explicit block-exceptions so a
  // user who paused the pack can keep blocking their own custom domains.
  if (state.paused) {
    const blocked = unique(state.blockDomains).filter((domain) => !allowSet.has(domain))
    return { blocked, allowed: allowDomains }
  }

  const policy = findPolicy(pack, state.activePolicyId)
  const blockedCategories = policy ? new Set(policy.block) : new Set(pack.services.map((s) => s.category))
  const strict = policy ? policy.strict : true

  const blocked = new Set()
  for (const service of pack.services) {
    if (!blockedCategories.has(service.category)) {
      continue
    }
    if (service.strictOnly && !strict) {
      continue
    }
    for (const domain of service.domains) {
      blocked.add(domain)
    }
  }

  for (const domain of unique(state.blockDomains)) {
    blocked.add(domain)
  }

  for (const domain of allowSet) {
    blocked.delete(domain)
  }

  return {
    blocked: Array.from(blocked).sort((a, b) => a.localeCompare(b)),
    allowed: allowDomains,
  }
}

// Compiles resolved domains into DNR rules. Block rules carry priority 1; allow
// exceptions carry priority 2 so they override blocks (including subdomains).
export function buildDnrRules({ blocked, allowed }) {
  const rules = []
  let id = 1

  for (const domain of blocked) {
    rules.push({
      id: id++,
      priority: 1,
      action: { type: 'block' },
      condition: { urlFilter: `||${domain}^`, resourceTypes: RESOURCE_TYPES },
    })
  }

  for (const domain of allowed) {
    rules.push({
      id: id++,
      priority: 2,
      action: { type: 'allow' },
      condition: { urlFilter: `||${domain}^`, resourceTypes: RESOURCE_TYPES },
    })
  }

  return rules
}

function unique(value) {
  return Array.isArray(value) ? Array.from(new Set(value.filter((entry) => typeof entry === 'string'))) : []
}
