import { useEffect, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  LockKeyhole,
  MousePointerClick,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  WifiOff,
} from 'lucide-react'
import { buildExport, extensionForFormat, rulePack } from '../lib/blocklists'
import { downloadText } from '../lib/download'
import { useRules } from '../lib/rules-context'
import { useSaas } from '../lib/saas-context'
import { usePathname } from '../router'
import { Link } from './Link'

const navItems = [
  { to: '/app', label: 'Setup', Icon: MousePointerClick },
  { to: '/app/protection', label: 'Protection', Icon: ShieldCheck },
  { to: '/app/blocklists', label: 'Blocklists', Icon: WifiOff },
  { to: '/app/account', label: 'Account', Icon: UserRound },
]

type CheckoutBanner = 'activating' | 'active' | 'cancelled' | null

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname().replace(/\/$/, '') || '/'
  const { licensed, session, checkoutLoading, startCheckout, refreshEntitlement, showToast } = useSaas()
  const { activeDomains, exportFormat } = useRules()

  // Returning from Stripe: read the redirect marker once, then poll the
  // entitlement until the webhook lands (usually seconds).
  const [checkoutBanner, setCheckoutBanner] = useState<CheckoutBanner>(() => {
    const checkout = new URLSearchParams(window.location.search).get('checkout')

    if (checkout === 'success') {
      return 'activating'
    }

    return checkout === 'cancelled' ? 'cancelled' : null
  })

  if (checkoutBanner === 'activating' && licensed) {
    setCheckoutBanner('active')
  }

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('checkout')) {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  useEffect(() => {
    if (checkoutBanner !== 'activating' || licensed || !session) {
      return
    }

    let attempts = 0
    const timer = window.setInterval(() => {
      attempts += 1
      void refreshEntitlement()

      if (attempts >= 12) {
        window.clearInterval(timer)
      }
    }, 2500)

    return () => window.clearInterval(timer)
  }, [checkoutBanner, licensed, refreshEntitlement, session])

  const downloadRules = () => {
    downloadText(
      `aegis-ai-blocker-${exportFormat}.${extensionForFormat(exportFormat)}`,
      buildExport(exportFormat, activeDomains),
    )
    showToast('Rules downloaded')
  }

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Aegis navigation">
        <Link to="/" className="brand-lockup brand-link">
          <div className="brand-mark" aria-hidden="true">
            <ShieldCheck size={25} strokeWidth={2.25} />
          </div>
          <div>
            <p className="brand-name">Aegis AI Blocker</p>
            <p className="brand-subtitle">Rule pack {rulePack.version}</p>
          </div>
        </Link>

        <nav className="nav-list" aria-label="Dashboard pages">
          {navItems.map(({ to, label, Icon }) => (
            <Link key={to} to={to} className={`nav-item ${pathname === to ? 'active' : ''}`}>
              <Icon size={18} />
              {label}
            </Link>
          ))}
        </nav>

        <section className="license-panel">
          <div className="license-icon" aria-hidden="true">
            {licensed ? <ShieldCheck size={20} /> : <LockKeyhole size={20} />}
          </div>
          <p className="panel-title">Lifetime license</p>
          <p className="license-state">{licensed ? 'Active — verified by server' : 'Purchase required'}</p>
          <button
            className="soft-button"
            type="button"
            onClick={licensed ? downloadRules : () => void startCheckout()}
          >
            {licensed ? 'Download rules' : checkoutLoading ? 'Starting…' : 'Buy lifetime'}
          </button>
          <Link to="/changelog" className="sidebar-whats-new">
            <SlidersHorizontal size={13} />
            What&apos;s new
          </Link>
        </section>
      </aside>

      <section className="workspace">
        {checkoutBanner && (
          <div
            className={`checkout-banner ${checkoutBanner === 'cancelled' ? 'cancelled' : ''}`}
            role="status"
            aria-live="polite"
          >
            {checkoutBanner === 'activating' && (
              <>
                <span className="banner-spinner" aria-hidden="true" />
                Payment received — activating your lifetime license…
              </>
            )}
            {checkoutBanner === 'active' && (
              <>
                <CheckCircle2 size={18} />
                Lifetime access active. Download rules for every device you own.
              </>
            )}
            {checkoutBanner === 'cancelled' && (
              <>
                <AlertTriangle size={18} />
                Checkout was cancelled — no payment was taken.
              </>
            )}
          </div>
        )}
        {children}
      </section>
    </main>
  )
}

