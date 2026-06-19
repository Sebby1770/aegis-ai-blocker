import { createContext, useContext } from 'react'
import type { ExportFormat } from './blocklists'
import type { RulesSettings } from './rules-storage'

export type ExceptionKind = 'allow' | 'block'

export type RulesContextValue = RulesSettings & {
  // Effective lists after applying exceptions: `activeDomains` is what gets
  // blocked, `activeAllowed` is the allow exceptions surfaced for exports.
  activeDomains: string[]
  activeAllowed: string[]
  activeServiceCount: number
  toggleCategory: (id: string) => void
  setStrictMode: (value: boolean) => void
  setExportFormat: (format: ExportFormat) => void
  applyPolicy: (policyId: string) => void
  // Returns the normalized domain that was added, or null if the input was
  // invalid or already present in that list.
  addException: (kind: ExceptionKind, domain: string) => string | null
  removeException: (kind: ExceptionKind, domain: string) => void
}

export const RulesContext = createContext<RulesContextValue | null>(null)

export function useRules() {
  const context = useContext(RulesContext)

  if (!context) {
    throw new Error('useRules must be used inside RulesProvider')
  }

  return context
}
