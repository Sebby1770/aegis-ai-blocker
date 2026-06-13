import { createContext, useContext } from 'react'
import type { ExportFormat } from './blocklists'
import type { RulesSettings } from './rules-storage'

export type RulesContextValue = RulesSettings & {
  activeDomains: string[]
  activeServiceCount: number
  toggleCategory: (id: string) => void
  setStrictMode: (value: boolean) => void
  setExportFormat: (format: ExportFormat) => void
}

export const RulesContext = createContext<RulesContextValue | null>(null)

export function useRules() {
  const context = useContext(RulesContext)

  if (!context) {
    throw new Error('useRules must be used inside RulesProvider')
  }

  return context
}
