import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { getActiveServices, resolveRules, toValidDomain } from './blocklists'
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
    const { blocked: activeDomains, allowed: activeAllowed } = resolveRules(settings)
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
      activeAllowed,
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
          // Applying a policy resets categories/strict but keeps the user's
          // personal allow/block exceptions in place.
          return policy
            ? { ...settingsForPolicy(policy, current.exportFormat), allowDomains: current.allowDomains, blockDomains: current.blockDomains }
            : current
        }),
      addException: (kind, domain) => {
        const normalized = toValidDomain(domain)
        if (!normalized) {
          return null
        }
        setSettings((current) => {
          if (kind === 'allow') {
            const allowDomains = current.allowDomains.includes(normalized)
              ? current.allowDomains
              : [...current.allowDomains, normalized]
            // Allow wins: drop it from the block list if present.
            const blockDomains = current.blockDomains.filter((entry) => entry !== normalized)
            return { ...current, allowDomains, blockDomains }
          }
          // A domain that's an allow exception can't also be custom-blocked.
          if (current.allowDomains.includes(normalized) || current.blockDomains.includes(normalized)) {
            return current
          }
          return { ...current, blockDomains: [...current.blockDomains, normalized] }
        })
        return normalized
      },
      removeException: (kind, domain) =>
        setSettings((current) =>
          kind === 'allow'
            ? { ...current, allowDomains: current.allowDomains.filter((entry) => entry !== domain) }
            : { ...current, blockDomains: current.blockDomains.filter((entry) => entry !== domain) },
        ),
    }
  }, [settings])

  return <RulesContext.Provider value={value}>{children}</RulesContext.Provider>
}
