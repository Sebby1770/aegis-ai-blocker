import { normalizeDomain, rulePack, type BreakageRisk } from './blocklists'

// Reverse index: every blocklisted domain -> the service and category it
// belongs to. Built once from the rule pack so explanations are O(labels).
export type DomainOwner = {
  domain: string
  service: string
  categoryId: string
  categoryName: string
  breakageRisk: BreakageRisk
  note?: string
  strictOnly: boolean
}

const ownerByDomain = new Map<string, DomainOwner>()

for (const category of rulePack.categories) {
  for (const service of category.services) {
    for (const domain of service.domains) {
      ownerByDomain.set(domain, {
        domain,
        service: service.name,
        categoryId: category.id,
        categoryName: category.name,
        breakageRisk: service.breakageRisk,
        note: service.note,
        strictOnly: Boolean(service.strictOnly),
      })
    }
  }
}

export type Explanation = {
  input: string
  normalized: string
  status: 'blocked' | 'strict-only' | 'allowed'
  matchType: 'exact' | 'parent' | null
  owner: DomainOwner | null
  reason: string
}

// Walks parent domains so a subdomain (api.openai.com) resolves to the rule
// that owns it (openai.com), and reports whether the match was exact or by a
// parent domain — the foundation of "why is this blocked".
function findOwner(normalized: string): { owner: DomainOwner; matchType: 'exact' | 'parent' } | null {
  if (ownerByDomain.has(normalized)) {
    return { owner: ownerByDomain.get(normalized)!, matchType: 'exact' }
  }

  const labels = normalized.split('.')

  for (let i = 1; i < labels.length - 1; i += 1) {
    const parent = labels.slice(i).join('.')

    if (ownerByDomain.has(parent)) {
      return { owner: ownerByDomain.get(parent)!, matchType: 'parent' }
    }
  }

  return null
}

// Explains how a hostname is treated under the current strict-mode setting,
// including the case where a domain is only covered when strict mode is on.
export function explainDomain(input: string, strictMode: boolean): Explanation {
  const normalized = normalizeDomain(input)

  if (!normalized) {
    return { input, normalized: '', status: 'allowed', matchType: null, owner: null, reason: 'Enter a domain to check it.' }
  }

  const match = findOwner(normalized)

  if (!match) {
    return {
      input,
      normalized,
      status: 'allowed',
      matchType: null,
      owner: null,
      reason: `${normalized} is not in the rule pack — it would be allowed. If it is an AI service we miss, request it on Support.`,
    }
  }

  const { owner, matchType } = match
  const via = matchType === 'parent' ? ` (matched by parent domain ${owner.domain})` : ''

  if (owner.strictOnly && !strictMode) {
    return {
      input,
      normalized,
      status: 'strict-only',
      matchType,
      owner,
      reason: `${normalized} belongs to ${owner.service}${via}, listed under ${owner.categoryName}. It is included only in strict mode, which is currently off — so it is allowed right now.`,
    }
  }

  return {
    input,
    normalized,
    status: 'blocked',
    matchType,
    owner,
    reason: `${normalized} is blocked because it belongs to ${owner.service}${via}, categorized under ${owner.categoryName}.`,
  }
}

export const breakageLabels: Record<BreakageRisk, string> = {
  low: 'Low breakage risk',
  medium: 'Medium breakage risk',
  high: 'High breakage risk',
}
