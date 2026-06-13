import { rulePack, type ExportFormat } from './blocklists'

export type RulesSettings = {
  enabledCategories: Record<string, boolean>
  strictMode: boolean
  exportFormat: ExportFormat
  activePolicyId: string
}

export const STORAGE_KEY = 'aegis.rules.v2'

const FORMATS: ExportFormat[] = ['adguard', 'hosts', 'dnsmasq', 'plain', 'safari']

// New installs default to the strongest, most-honest stance: block everything
// in the pack. Users relax it by choosing a softer policy.
export function defaultSettings(): RulesSettings {
  return {
    enabledCategories: Object.fromEntries(rulePack.categories.map((category) => [category.id, true])),
    strictMode: false,
    exportFormat: 'adguard',
    activePolicyId: 'custom',
  }
}

// Parses persisted settings defensively: unknown categories are dropped, new
// categories default to enabled, and bad values fall back to defaults so a
// stale or tampered localStorage entry can never break the dashboard.
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

    return {
      enabledCategories,
      strictMode: typeof parsed.strictMode === 'boolean' ? parsed.strictMode : defaults.strictMode,
      exportFormat: FORMATS.includes(parsed.exportFormat as ExportFormat)
        ? (parsed.exportFormat as ExportFormat)
        : defaults.exportFormat,
      activePolicyId:
        typeof parsed.activePolicyId === 'string' ? parsed.activePolicyId : defaults.activePolicyId,
    }
  } catch {
    return defaults
  }
}

export function serializeSettings(settings: RulesSettings): string {
  return JSON.stringify(settings)
}
