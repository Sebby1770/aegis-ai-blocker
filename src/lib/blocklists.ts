import rulesData from '../data/ai-services.json'
import { matchDomainTrie, trieFor } from './domain-trie'

export type BreakageRisk = 'low' | 'medium' | 'high'

export type RuleService = {
  name: string
  domains: string[]
  breakageRisk: BreakageRisk
  verified: string
  note?: string
  strictOnly?: boolean
}

export type RuleCategory = {
  id: string
  name: string
  description: string
  color: string
  services: RuleService[]
}

export type Policy = {
  id: string
  name: string
  tagline: string
  space: string
  recommendedFor: string
  block: string[]
  strict: boolean
}

export type RulePack = {
  version: string
  updatedAt: string
  disclaimer: string
  categories: RuleCategory[]
  policies: Policy[]
}

export type ExportFormat = 'adguard' | 'hosts' | 'dnsmasq' | 'plain' | 'safari'

export const rulePack = rulesData as RulePack

export const exportLabels: Record<ExportFormat, string> = {
  adguard: 'AdGuard/uBlock DNS',
  hosts: 'Hosts file',
  dnsmasq: 'dnsmasq',
  plain: 'Plain domains',
  safari: 'Safari content blocker',
}

const header = (name: string) =>
  [
    `# Aegis AI Blocker - ${name}`,
    `# Rule pack: ${rulePack.version}`,
    `# Updated: ${rulePack.updatedAt}`,
    `# ${rulePack.disclaimer}`,
    '',
  ].join('\n')

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function getActiveServices(enabledCategories: Record<string, boolean>, strictMode: boolean) {
  return rulePack.categories.flatMap((category) => {
    if (!enabledCategories[category.id]) {
      return []
    }

    return category.services
      .filter((service) => strictMode || !service.strictOnly)
      .map((service) => ({ ...service, category }))
  })
}

export function getActiveDomains(enabledCategories: Record<string, boolean>, strictMode: boolean) {
  return Array.from(
    new Set(
      getActiveServices(enabledCategories, strictMode)
        .flatMap((service) => service.domains)
        .map((domain) => domain.trim().toLowerCase())
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b))
}

export type ResolvedRules = { blocked: string[]; allowed: string[] }

// Layers the user's exception lists on top of the active pack domains.
//   blocked = active pack domains + user blockDomains, minus exact allowDomains
//   allowed = the allow exceptions, surfaced separately so export formats that
//             support allow rules (AdGuard, dnsmasq, Safari) can override a
//             broader parent-domain block from the pack.
// Takes a structural shape rather than RulesSettings to avoid importing back
// from rules-storage (which imports values from this module).
export function resolveRules(settings: {
  enabledCategories: Record<string, boolean>
  strictMode: boolean
  allowDomains?: string[]
  blockDomains?: string[]
}): ResolvedRules {
  const normalize = (list?: string[]) =>
    Array.from(new Set((list ?? []).map((domain) => normalizeDomain(domain)).filter(Boolean)))

  const base = getActiveDomains(settings.enabledCategories, settings.strictMode)
  const allow = normalize(settings.allowDomains)
  const allowSet = new Set(allow)
  const blockedSet = new Set([...base, ...normalize(settings.blockDomains)])
  for (const domain of allowSet) {
    blockedSet.delete(domain)
  }

  return {
    blocked: Array.from(blockedSet).sort((a, b) => a.localeCompare(b)),
    allowed: allow.sort((a, b) => a.localeCompare(b)),
  }
}

export function isDomainBlocked(input: string, domains: string[]) {
  const normalized = normalizeDomain(input)

  if (!normalized) {
    return { blocked: false, matchedDomain: '' }
  }

  const matchedDomain = matchDomainTrie(trieFor(domains), normalized)

  return { blocked: Boolean(matchedDomain), matchedDomain }
}

export function normalizeDomain(input: string) {
  const trimmed = input.trim().toLowerCase()

  if (!trimmed) {
    return ''
  }

  try {
    const withProtocol = trimmed.includes('://') ? trimmed : `https://${trimmed}`
    return new URL(withProtocol).hostname.replace(/^www\./, '')
  } catch {
    return trimmed.replace(/^www\./, '').split('/')[0] ?? ''
  }
}

// A plausible multi-label hostname: valid label characters only, at least one
// dot, an alphabetic TLD. `normalizeDomain` is intentionally lenient (it
// percent-encodes junk so the live checker degrades gracefully), so it is not
// enough on its own to validate something a user typed into an exceptions box.
const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

// Returns the normalized form of `input` only if it looks like a real domain,
// otherwise null. Use this to validate user-entered exception domains.
export function toValidDomain(input: string): string | null {
  const normalized = normalizeDomain(input)
  return normalized && DOMAIN_RE.test(normalized) ? normalized : null
}

// `allowed` are exception domains the user wants permitted even if a broader
// rule would catch them. Formats that support allow rules (AdGuard, dnsmasq,
// Safari) emit explicit exceptions so a parent-domain block is overridden;
// exact-match formats (hosts, plain) already exclude them from `domains`, so
// they only get a documentation note.
export function buildExport(format: ExportFormat, domains: string[], allowed: string[] = []) {
  const allowNote =
    allowed.length > 0
      ? `# ${allowed.length} allow exception${allowed.length === 1 ? '' : 's'} not expressible in this format: ${allowed.join(', ')}\n`
      : ''

  switch (format) {
    case 'adguard': {
      const blocks = domains.map((domain) => `||${domain}^`)
      const allows = allowed.map((domain) => `@@||${domain}^`)
      return `${header('AdGuard/uBlock DNS filters')}${[...blocks, ...allows].join('\n')}\n`
    }
    case 'hosts':
      return `${header('Hosts file')}${allowNote}${domains
        .map((domain) => [`0.0.0.0 ${domain}`, `:: ${domain}`].join('\n'))
        .join('\n')}\n`
    case 'dnsmasq': {
      const blocks = domains.map((domain) => `address=/${domain}/0.0.0.0`)
      // server=/domain/# routes the domain to the default resolver; dnsmasq's
      // most-specific match makes this override a broader address= block.
      const allows = allowed.map((domain) => `server=/${domain}/#`)
      return `${header('dnsmasq')}${[...blocks, ...allows].join('\n')}\n`
    }
    case 'plain':
      return `${header('Plain domains')}${allowNote}${domains.join('\n')}\n`
    case 'safari':
      return JSON.stringify(
        [
          ...domains.map((domain) => ({
            trigger: { 'url-filter': `^https?://([^/]+\\.)?${escapeRegex(domain)}(/|$)` },
            action: { type: 'block' },
          })),
          // ignore-previous-rules must come last: Safari applies the final
          // matching rule, so this lifts the block for an allowed domain.
          ...allowed.map((domain) => ({
            trigger: { 'url-filter': `^https?://([^/]+\\.)?${escapeRegex(domain)}(/|$)` },
            action: { type: 'ignore-previous-rules' },
          })),
        ],
        null,
        2,
      )
  }
}

export function buildIosProfileGuide(domains: string[]) {
  return [
    'Aegis AI Blocker iOS profile notes',
    '',
    'iOS does not allow ordinary apps to install a system-wide hosts file.',
    'For production, use a Network Extension DNS proxy entitlement or import these domains into a managed DNS blocker such as NextDNS, AdGuard DNS, or a supervised device filter.',
    '',
    'Domains:',
    ...domains,
    '',
  ].join('\n')
}

export function extensionForFormat(format: ExportFormat) {
  return format === 'safari' ? 'json' : 'txt'
}
