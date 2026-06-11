import { createContext, useContext } from 'react'
import type { SaaSSession } from './supabase'

export type Entitlement = {
  licensed: boolean
  license: {
    id: string
    provider: string
    status: string
    purchased_at: string
  } | null
}

export type SaasContextValue = {
  configured: boolean
  session: SaaSSession | null
  userEmail: string
  entitlement: Entitlement | null
  licensed: boolean
  authLoading: boolean
  checkoutLoading: boolean
  toast: string
  showToast: (message: string) => void
  sendMagicLink: (email: string) => Promise<void>
  signOut: () => Promise<void>
  startCheckout: () => Promise<void>
  refreshEntitlement: () => Promise<boolean>
}

export const SaasContext = createContext<SaasContextValue | null>(null)

export const priceDisplay = (import.meta.env.VITE_LIFETIME_PRICE_DISPLAY as string | undefined) ?? '$29'

export function useSaas() {
  const context = useContext(SaasContext)

  if (!context) {
    throw new Error('useSaas must be used inside SaasProvider')
  }

  return context
}
