import { useEffect } from 'react'
import './App.css'
import { DashboardShell } from './components/DashboardShell'
import { Footer } from './components/Footer'
import { RulesProvider } from './lib/rules'
import { SaasProvider } from './lib/saas'
import { useSaas } from './lib/saas-context'
import { Catalog } from './pages/Catalog'
import { Changelog } from './pages/Changelog'
import { Account } from './pages/dashboard/Account'
import { Blocklists } from './pages/dashboard/Blocklists'
import { Protection } from './pages/dashboard/Protection'
import { Setup } from './pages/dashboard/Setup'
import { Faq } from './pages/Faq'
import { Features } from './pages/Features'
import { Landing } from './pages/Landing'
import { Privacy, Refunds, Terms } from './pages/Legal'
import { NotFound } from './pages/NotFound'
import { Philosophy } from './pages/Philosophy'
import { Pricing } from './pages/Pricing'
import { SecurityPolicy } from './pages/SecurityPolicy'
import { Support } from './pages/Support'
import { usePathname } from './router'

const pageTitles: Record<string, string> = {
  '/': 'Aegis — Decide where AI is allowed in your life',
  '/philosophy': 'Philosophy — Aegis AI Blocker',
  '/catalog': 'Catalog — Aegis AI Blocker',
  '/features': 'Features — Aegis AI Blocker',
  '/pricing': 'Pricing — Aegis AI Blocker',
  '/faq': 'FAQ — Aegis AI Blocker',
  '/app': 'Setup — Aegis AI Blocker',
  '/app/protection': 'Protection — Aegis AI Blocker',
  '/app/blocklists': 'Blocklists — Aegis AI Blocker',
  '/app/account': 'Account — Aegis AI Blocker',
  '/privacy': 'Privacy Policy — Aegis AI Blocker',
  '/terms': 'Terms of Service — Aegis AI Blocker',
  '/refunds': 'Refund Policy — Aegis AI Blocker',
  '/support': 'Support — Aegis AI Blocker',
  '/changelog': 'Changelog — Aegis AI Blocker',
  '/security': 'Security — Aegis AI Blocker',
}

const pageDescriptions: Record<string, string> = {
  '/':
    'Aegis is a policy engine for AI exposure: choose a value — Focus, Child-safe, School exam, Workplace — and it becomes ready-to-use rules for every device. One payment, lifetime access, no tracking.',
  '/philosophy':
    'Aegis is about intentional digital boundaries — choosing, maintaining, and enforcing where AI tools are allowed in your digital life.',
  '/catalog':
    'Every AI service Aegis tracks, with last-verified dates, breakage-risk labels, and the domains behind each rule. No black box.',
  '/features':
    'Category toggles, strict mode, a live domain tester, and five export formats: AdGuard/uBlock, hosts file, dnsmasq, plain domains, and Safari content blocker.',
  '/pricing':
    'One payment, lifetime access to every AI blocklist format and every future rule pack update. 14-day refund policy, payments by Stripe.',
  '/faq':
    'Honest answers about what Aegis blocks, which devices it works on, refunds, and the data we do and do not collect.',
  '/privacy': 'What Aegis collects (account email, license records) and what it never collects (your browsing).',
  '/terms': 'The terms that govern Aegis AI Blocker accounts and lifetime licenses.',
  '/refunds': 'Request a refund within 14 days of purchase — refunds deactivate the license automatically.',
  '/support': 'Get help with sign-in, licenses, and exports — or request a new AI service for the rule pack.',
  '/changelog': 'Every Aegis product and rule pack release, newest first.',
  '/security': 'How to report a vulnerability privately, and the security controls Aegis runs in production.',
}

const dashboardPages: Record<string, React.ComponentType> = {
  '/app': Setup,
  '/app/protection': Protection,
  '/app/blocklists': Blocklists,
  '/app/account': Account,
}

function Routes() {
  const pathname = usePathname()
  const { toast } = useSaas()
  const route = pathname.replace(/\/$/, '') || '/'
  const isDashboard = route === '/app' || route.startsWith('/app/')

  useEffect(() => {
    document.title = pageTitles[route] ?? 'Aegis AI Blocker'

    const description = pageDescriptions[route]
    const meta = document.querySelector('meta[name="description"]')

    if (description && meta) {
      meta.setAttribute('content', description)
    }
  }, [route])

  let page: React.ReactNode

  if (isDashboard) {
    const DashboardPage = dashboardPages[route] ?? NotFound

    page = (
      <DashboardShell>
        <DashboardPage />
      </DashboardShell>
    )
  } else {
    switch (route) {
      case '/':
        page = <Landing />
        break
      case '/philosophy':
        page = <Philosophy />
        break
      case '/catalog':
        page = <Catalog />
        break
      case '/features':
        page = <Features />
        break
      case '/pricing':
        page = <Pricing />
        break
      case '/faq':
        page = <Faq />
        break
      case '/privacy':
        page = <Privacy />
        break
      case '/terms':
        page = <Terms />
        break
      case '/refunds':
        page = <Refunds />
        break
      case '/support':
        page = <Support />
        break
      case '/changelog':
        page = <Changelog />
        break
      case '/security':
        page = <SecurityPolicy />
        break
      default:
        page = <NotFound />
    }
  }

  return (
    <>
      {page}
      {!isDashboard && <Footer />}
      <div className={`toast ${toast ? 'show' : ''}`} role="status" aria-live="polite">
        {toast}
      </div>
    </>
  )
}

function App() {
  return (
    <SaasProvider>
      <RulesProvider>
        <Routes />
      </RulesProvider>
    </SaasProvider>
  )
}

export default App
