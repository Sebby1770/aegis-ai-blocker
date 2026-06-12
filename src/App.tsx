import { useEffect } from 'react'
import './App.css'
import { Footer } from './components/Footer'
import { SaasProvider } from './lib/saas'
import { useSaas } from './lib/saas-context'
import { Changelog } from './pages/Changelog'
import { Dashboard } from './pages/Dashboard'
import { Faq } from './pages/Faq'
import { Features } from './pages/Features'
import { Landing } from './pages/Landing'
import { Privacy, Refunds, Terms } from './pages/Legal'
import { NotFound } from './pages/NotFound'
import { Pricing } from './pages/Pricing'
import { SecurityPolicy } from './pages/SecurityPolicy'
import { Support } from './pages/Support'
import { usePathname } from './router'

const pageTitles: Record<string, string> = {
  '/': 'Aegis AI Blocker — Block AI tools on every device',
  '/features': 'Features — Aegis AI Blocker',
  '/pricing': 'Pricing — Aegis AI Blocker',
  '/faq': 'FAQ — Aegis AI Blocker',
  '/app': 'Dashboard — Aegis AI Blocker',
  '/privacy': 'Privacy Policy — Aegis AI Blocker',
  '/terms': 'Terms of Service — Aegis AI Blocker',
  '/refunds': 'Refund Policy — Aegis AI Blocker',
  '/support': 'Support — Aegis AI Blocker',
  '/changelog': 'Changelog — Aegis AI Blocker',
  '/security': 'Security — Aegis AI Blocker',
}

const pageDescriptions: Record<string, string> = {
  '/':
    'Aegis turns a curated, versioned catalogue of AI services into ready-to-use blocklists for iPhone, desktop browsers, and home routers. One payment, lifetime access, no tracking.',
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

function Routes() {
  const pathname = usePathname()
  const { toast } = useSaas()
  const route = pathname.replace(/\/$/, '') || '/'

  useEffect(() => {
    document.title = pageTitles[route] ?? 'Aegis AI Blocker'

    const description = pageDescriptions[route]
    const meta = document.querySelector('meta[name="description"]')

    if (description && meta) {
      meta.setAttribute('content', description)
    }
  }, [route])

  let page: React.ReactNode

  switch (route) {
    case '/':
      page = <Landing />
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
    case '/app':
      page = <Dashboard />
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

  return (
    <>
      {page}
      <Footer />
      <div className={`toast ${toast ? 'show' : ''}`} role="status" aria-live="polite">
        {toast}
      </div>
    </>
  )
}

function App() {
  return (
    <SaasProvider>
      <Routes />
    </SaasProvider>
  )
}

export default App
