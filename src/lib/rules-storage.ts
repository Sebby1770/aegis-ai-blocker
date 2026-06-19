import { rulePack, toValidDomain, type ExportFormat } from './blocklists'

export type RulesSettings = {
  enabledCategories: Record<string, boolean>
  strictMode: boolean
  exportFormat: ExportFormat
  activePolicyId: string
  // User exceptions layered on top of the policy. `allowDomains` are always
  // permitted even when a category (or strict mode) would block them;
  // `blockDomains` are extra domains blocked beyond the pack. Allow wins on
  // conflict, so a domain never appears in both lists.
  allowDomains: string[]
  blockDomains: string[]
}

export const STORAGE_KEY = 'aegis.rules.v2'

const FORMATS: ExportFormat[] = ['adguard', 'hosts', 'dnsmasq', 'plain', 'safari']

// Normalizes a list of user-entered domains: canonicalize each (strip
// protocol/path/www/casing), drop anything that isn't a plausible domain, and
// de-duplicate while preserving first-seen order.
export function sanitizeDomainList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  const seen = new Set<string>()
  const out: string[] = []

  for (const entry of value) {
    if (typeof entry !== 'string') {
      continue
    }
    const normalized = toValidDomain(entry)
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized)
      out.push(normalized)
    }
  }

  return out
}

// New installs default to the strongest, most-honest stance: block everything
// in the pack. Users relax it by choosing a softer policy.
export function defaultSettings(): RulesSettings {
  return {
    enabledCategories: Object.fromEntries(rulePack.categories.map((category) => [category.id, true])),
    strictMode: false,
    exportFormat: 'adguard',
    activePolicyId: 'custom',
    allowDomains: [],
    blockDomains: [],
  }
}

// Parses persisted settings defensively: unknown categories are dropped, new
// categories default to enabled, exception lists are sanitized, and bad values
// fall back to defaults so a stale or tampered localStorage entry can never
// break the dashboard.
export function parseSettings(raw: string | null): RulesSettings {
  const defaults = defaultSettings()

  if (!raw) {
    return defaults
  }

  try {
    const parsed = JSON.parse(raw) as Partial<RulesSettings>
    const enabledCategories = { ...defaults.enabledCategories }

    if (parsed.enabledCategories && typeof parsed.enabledCategories === 'object') {
      for (const id of Object.keys(enabledCategories)) {
        const value = (parsed.enabledCategories as Record<string, unknown>)[id]

        if (typeof value === 'boolean') {
          enabledCategories[id] = value
        }
      }
    }

    const allowDomains = sanitizeDomainList(parsed.allowDomains)
    const allowSet = new Set(allowDomains)
    // Allow always wins: a domain can't be in both lists.
    const blockDomains = sanitizeDomainList(parsed.blockDomains).filter((domain) => !allowSet.has(domain))

    return {
      enabledCategories,
      strictMode: typeof parsed.strictMode === 'boolean' ? parsed.strictMode : defaults.strictMode,
      exportFormat: FORMATS.includes(parsed.exportFormat as ExportFormat)
        ? (parsed.exportFormat as ExportFormat)
        : defaults.exportFormat,
      activePolicyId:
        typeof parsed.activePolicyId === 'string' ? parsed.activePolicyId : defaults.activePolicyId,
      allowDomains,
      blockDomains,
    }
  } catch {
    return defaults
  }
}

export function serializeSettings(settings: RulesSettings): string {
  return JSON.stringify(settings)
}
