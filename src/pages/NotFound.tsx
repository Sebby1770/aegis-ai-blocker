import { ShieldCheck } from 'lucide-react'
import { Link } from '../components/Link'

export function NotFound() {
  return (
    <div className="not-found">
      <div className="brand-mark" aria-hidden="true">
        <ShieldCheck size={28} strokeWidth={2.25} />
      </div>
      <h1>Page not found</h1>
      <p>That page does not exist. The dashboard and rule builder live at /app.</p>
      <div className="button-row">
        <Link to="/" className="secondary-button">
          Home
        </Link>
        <Link to="/app" className="primary-button">
          Open dashboard
        </Link>
      </div>
    </div>
  )
}
