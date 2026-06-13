import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { getActiveDomains, getActiveServices } from './blocklists'
import { matchPolicyId, policies, settingsForPolicy } from './policies'
import { RulesContext, type RulesContextValue } from './rules-context'
import { parseSettings, serializeSettings, STORAGE_KEY, type RulesSettings } from './rules-storage'

export function RulesProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<RulesSettings>(() => {
    const parsed = parseSettings(window.localStorage.getItem(STORAGE_KEY))
    // Reconcile the stored policy label with the stored switches in case the
    // pack's policies changed since the settings were saved.
    return { ...parsed, activePolicyId: matchPolicyId(parsed) }
  })

  // Persisting to localStorage keeps the user's chosen policy across visits —
  // the dashboard remembers what they configured.
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, serializeSettings(settings))
    } catch {
      // Storage can be full or blocked (private browsing); settings simply
      // become session-only.
    }
  }, [settings])

  const value = useMemo<RulesContextValue>(() => {
    const activeDomains = getActiveDomains(settings.enabledCategories, settings.strictMode)
    const activeServiceCount = getActiveServices(settings.enabledCategories, settings.strictMode).length

    // Any manual change re-derives the active policy: it becomes a named
    // policy if the switches match one, otherwise "custom".
    const reconcile = (next: RulesSettings): RulesSettings => ({
      ...next,
      activePolicyId: matchPolicyId(next),
    })

    return {
      ...settings,
      activeDomains,
      activeServiceCount,
      toggleCategory: (id) =>
        setSettings((current) =>
          reconcile({
            ...current,
            enabledCategories: { ...current.enabledCategories, [id]: !current.enabledCategories[id] },
          }),
        ),
      setStrictMode: (strictMode) => setSettings((current) => reconcile({ ...current, strictMode })),
      setExportFormat: (exportFormat) => setSettings((current) => ({ ...current, exportFormat })),
      applyPolicy: (policyId) =>
        setSettings((current) => {
          const policy = policies.find((entry) => entry.id === policyId)
          return policy ? settingsForPolicy(policy, current.exportFormat) : current
        }),
    }
  }, [settings])

  return <RulesContext.Provider value={value}>{children}</RulesContext.Provider>
}
