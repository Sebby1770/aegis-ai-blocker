import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { SaasContext, type Entitlement, type SaasContextValue } from './saas-context'
import { isSupabaseConfigured, supabase, type SaaSSession } from './supabase'

export function SaasProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SaaSSession | null>(null)
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null)
  const [authLoading, setAuthLoading] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [toast, setToast] = useState('')
  const toastTimer = useRef<number | undefined>(undefined)

  const showToast = useCallback((message: string) => {
    window.clearTimeout(toastTimer.current)
    setToast(message)
    toastTimer.current = window.setTimeout(() => setToast(''), 2400)
  }, [])

  const refreshEntitlement = useCallback(async () => {
    if (!session) {
      return false
    }

    try {
      const response = await fetch('/api/entitlement', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      })

      if (!response.ok) {
        return false
      }

      const next = (await response.json()) as Entitlement
      setEntitlement(next)
      return next.licensed
    } catch {
      return false
    }
  }, [session])

  useEffect(() => {
    if (!supabase) {
      return
    }

    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setEntitlement(null)
    })

    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) {
      return
    }

    const timer = window.setTimeout(() => {
      void refreshEntitlement()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [refreshEntitlement, session])

  const sendMagicLink = useCallback(
    async (email: string) => {
      if (!supabase) {
        showToast('Add Supabase env vars first')
        return
      }

      setAuthLoading(true)
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/app`,
        },
      })
      setAuthLoading(false)

      showToast(error ? 'Sign-in link failed' : 'Check your email for the sign-in link')
    },
    [showToast],
  )

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut()
    setEntitlement(null)
    showToast('Signed out')
  }, [showToast])

  const startCheckout = useCallback(async () => {
    if (!isSupabaseConfigured) {
      showToast('Configure Supabase and Stripe env vars first')
      return
    }

    if (!session) {
      showToast('Sign in before checkout')
      return
    }

    setCheckoutLoading(true)

    try {
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          successPath: '/app?checkout=success',
          cancelPath: '/app?checkout=cancelled',
        }),
      })

      if (!response.ok) {
        showToast('Checkout could not start')
        return
      }

      const data = (await response.json()) as { url?: string; alreadyLicensed?: boolean }

      if (data.alreadyLicensed) {
        await refreshEntitlement()
        showToast('Lifetime access already active')
        return
      }

      if (data.url) {
        window.location.assign(data.url)
      }
    } catch {
      showToast('Checkout could not start')
    } finally {
      setCheckoutLoading(false)
    }
  }, [refreshEntitlement, session, showToast])

  const value = useMemo<SaasContextValue>(
    () => ({
      configured: isSupabaseConfigured,
      session,
      userEmail: session?.user.email ?? '',
      entitlement,
      licensed: Boolean(entitlement?.licensed),
      authLoading,
      checkoutLoading,
      toast,
      showToast,
      sendMagicLink,
      signOut,
      startCheckout,
      refreshEntitlement,
    }),
    [
      session,
      entitlement,
      authLoading,
      checkoutLoading,
      toast,
      showToast,
      sendMagicLink,
      signOut,
      startCheckout,
      refreshEntitlement,
    ],
  )

  return <SaasContext.Provider value={value}>{children}</SaasContext.Provider>
}
