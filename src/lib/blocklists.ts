import rulesData from '../data/ai-services.json'

export type RuleService = {
  name: string
  domains: string[]
  strictOnly?: boolean
}

export type RuleCategory = {
  id: string
  name: string
  description: string
  color: string
  services: RuleService[]
}

export type RulePack = {
  version: string
  updatedAt: string
  disclaimer: string
  categories: RuleCategory[]
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

export function isDomainBlocked(input: string, domains: string[]) {
  const normalized = normalizeDomain(input)

  if (!normalized) {
    return { blocked: false, matchedDomain: '' }
  }

  const matchedDomain =
    domains.find((domain) => normalized === domain || normalized.endsWith(`.${domain}`)) ?? ''

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

export function buildExport(format: ExportFormat, domains: string[]) {
  switch (format) {
    case 'adguard':
      return `${header('AdGuard/uBlock DNS filters')}${domains.map((domain) => `||${domain}^`).join('\n')}\n`
    case 'hosts':
      return `${header('Hosts file')}${domains
        .map((domain) => [`0.0.0.0 ${domain}`, `:: ${domain}`].join('\n'))
        .join('\n')}\n`
    case 'dnsmasq':
      return `${header('dnsmasq')}${domains.map((domain) => `address=/${domain}/0.0.0.0`).join('\n')}\n`
    case 'plain':
      return `${header('Plain domains')}${domains.join('\n')}\n`
    case 'safari':
      return JSON.stringify(
        domains.map((domain) => ({
          trigger: {
            'url-filter': `^https?://([^/]+\\.)?${escapeRegex(domain)}(/|$)`,
          },
          action: {
            type: 'block',
          },
        })),
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
