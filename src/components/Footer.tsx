import { ShieldCheck } from 'lucide-react'
import { Link } from './Link'
import { rulePack } from '../lib/blocklists'

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <div className="brand-lockup">
            <div className="brand-mark" aria-hidden="true">
              <ShieldCheck size={22} strokeWidth={2.25} />
            </div>
            <div>
              <p className="brand-name">Aegis AI Blocker</p>
              <p className="brand-subtitle">Rule pack {rulePack.version}</p>
            </div>
          </div>
          <p className="footer-disclaimer">
            Aegis blocks the AI services in its curated, versioned rule pack. No static blocklist can
            guarantee complete AI blocking forever; rules are updated as services change.
          </p>
        </div>

        <nav className="footer-columns" aria-label="Footer">
          <div>
            <p className="footer-heading">Product</p>
            <Link to="/app">Dashboard</Link>
            <Link to="/features">Features</Link>
            <Link to="/pricing">Pricing</Link>
            <Link to="/faq">FAQ</Link>
          </div>
          <div>
            <p className="footer-heading">Legal</p>
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/refunds">Refunds</Link>
          </div>
          <div>
            <p className="footer-heading">Resources</p>
            <Link to="/support">Support</Link>
            <Link to="/changelog">Changelog</Link>
            <Link to="/security">Security</Link>
            <a href="https://github.com/Sebby1770/aegis-ai-blocker" rel="noreferrer" target="_blank">
              GitHub
            </a>
          </div>
        </nav>
      </div>
      <p className="footer-fineprint">© 2026 Aegis AI Blocker. All rights reserved.</p>
    </footer>
  )
}
