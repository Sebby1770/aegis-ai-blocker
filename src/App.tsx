import './App.css'
import { Footer } from './components/Footer'
import { SaasProvider } from './lib/saas'
import { useSaas } from './lib/saas-context'
import { Dashboard } from './pages/Dashboard'
import { Landing } from './pages/Landing'
import { Privacy, Refunds, Terms } from './pages/Legal'
import { NotFound } from './pages/NotFound'
import { usePathname } from './router'

function Routes() {
  const pathname = usePathname()
  const { toast } = useSaas()

  let page: React.ReactNode

  switch (pathname.replace(/\/$/, '') || '/') {
    case '/':
      page = <Landing />
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
