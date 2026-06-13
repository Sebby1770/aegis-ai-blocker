import { ShieldCheck } from 'lucide-react'
import { rulePack } from '../lib/blocklists'
import { usePathname } from '../router'
import { Link } from './Link'

const navItems = [
  { to: '/philosophy', label: 'Philosophy' },
  { to: '/features', label: 'Features' },
  { to: '/catalog', label: 'Catalog' },
  { to: '/pricing', label: 'Pricing' },
]

export function MarketingHeader() {
  const pathname = usePathname().replace(/\/$/, '') || '/'

  return (
    <header className="landing-header">
      <Link to="/" className="brand-lockup brand-link">
        <div className="brand-mark" aria-hidden="true">
          <ShieldCheck size={25} strokeWidth={2.25} />
        </div>
        <div>
          <p className="brand-name">Aegis AI Blocker</p>
          <p className="brand-subtitle">Rule pack {rulePack.version}</p>
        </div>
      </Link>
      <nav className="landing-nav" aria-label="Primary">
        {navItems.map((item) => (
          <Link key={item.to} to={item.to} className={pathname === item.to ? 'active' : ''}>
            {item.label}
          </Link>
        ))}
        <Link to="/app" className="secondary-button landing-nav-cta">
          Open dashboard
        </Link>
      </nav>
    </header>
  )
}
