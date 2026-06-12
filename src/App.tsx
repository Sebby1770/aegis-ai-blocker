import { useEffect } from 'react'
import './App.css'
import { Footer } from './components/Footer'
import { SaasProvider } from './lib/saas'
import { useSaas } from './lib/saas-context'
import { Dashboard } from './pages/Dashboard'
import { Faq } from './pages/Faq'
import { Features } from './pages/Features'
import { Landing } from './pages/Landing'
import { Privacy, Refunds, Terms } from './pages/Legal'
import { NotFound } from './pages/NotFound'
import { Pricing } from './pages/Pricing'
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
}

function Routes() {
  const pathname = usePathname()
  const { toast } = useSaas()
  const route = pathname.replace(/\/$/, '') || '/'

  useEffect(() => {
    document.title = pageTitles[route] ?? 'Aegis AI Blocker'
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
