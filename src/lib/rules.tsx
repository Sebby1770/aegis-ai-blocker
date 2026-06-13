import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { getActiveDomains, getActiveServices } from './blocklists'
import { RulesContext, type RulesContextValue } from './rules-context'
import { parseSettings, serializeSettings, STORAGE_KEY, type RulesSettings } from './rules-storage'

export function RulesProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<RulesSettings>(() =>
    parseSettings(window.localStorage.getItem(STORAGE_KEY)),
  )

  // Persisting to localStorage keeps the user's blocklist choices across
  // visits — the dashboard remembers what they configured.
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

    return {
      ...settings,
      activeDomains,
      activeServiceCount,
      toggleCategory: (id) =>
        setSettings((current) => ({
          ...current,
          enabledCategories: { ...current.enabledCategories, [id]: !current.enabledCategories[id] },
        })),
      setStrictMode: (strictMode) => setSettings((current) => ({ ...current, strictMode })),
      setExportFormat: (exportFormat) => setSettings((current) => ({ ...current, exportFormat })),
    }
  }, [settings])

  return <RulesContext.Provider value={value}>{children}</RulesContext.Provider>
}
