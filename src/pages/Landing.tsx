import { useMemo, useState } from 'react'
import {
  ArrowRight,
  BadgeCheck,
  Ban,
  CheckCircle2,
  Download,
  KeyRound,
} from 'lucide-react'
import { isDomainBlocked } from '../lib/blocklists'
import { defaultDomainCount, defaultDomains, serviceCount, strictDomainCount } from '../lib/marketing'
import { priceDisplay, useSaas } from '../lib/saas-context'
import { Link } from '../components/Link'
import { MarketingHeader } from '../components/MarketingHeader'
import { navigate } from '../router'

function LiveDomainCheck() {
  const [value, setValue] = useState('chatgpt.com')
  const result = useMemo(() => isDomainBlocked(value, defaultDomains), [value])
  const hasInput = value.trim().length > 0

  return (
    <div className="landing-tester">
      <label className="tester-input">
        <span>Try it now — paste any AI site or API</span>
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="chatgpt.com"
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      {hasInput && (
        <div className={`test-result ${result.blocked ? 'allowed' : 'blocked'}`}>
          {result.blocked ? <CheckCircle2 size={18} /> : <Ban size={18} />}
          <span>
            {result.blocked
              ? `Covered — blocked by the ${result.matchedDomain} rule`
              : 'Not in the default pack — try strict mode in the dashboard, or request it'}
          </span>
        </div>
      )}
      <p className="landing-tester-note">
        Checked against the default rule pack, live in your browser. Nothing you type is sent
        anywhere.
      </p>
    </div>
  )
}

export function Landing() {
  const { licensed, checkoutLoading, session, startCheckout } = useSaas()

  const buyNow = () => {
    if (!session || licensed) {
      navigate('/app')
      return
    }

    void startCheckout()
  }

  return (
    <div className="landing">
      <MarketingHeader />

      <section className="hero">
        <p className="hero-eyebrow">
          <BadgeCheck size={16} />
          One payment. Lifetime access. No tracking.
        </p>
        <h1>Block AI tools on every device you own</h1>
        <p className="hero-copy">
          Aegis turns a curated, always-updated catalogue of AI services into ready-to-use
          blocklists for your phone, your browser, and your whole home network. Take back your
          focus — or your family&apos;s — in minutes.
        </p>
        <div className="hero-actions">
          <button className="primary-button hero-cta" type="button" onClick={buyNow}>
            {licensed ? <Download size={18} /> : <KeyRound size={18} />}
            {licensed ? 'Open your dashboard' : checkoutLoading ? 'Starting…' : `Get lifetime access · ${priceDisplay}`}
          </button>
          <Link to="/app" className="secondary-button hero-secondary">
            Try the rule builder free
            <ArrowRight size={16} />
          </Link>
        </div>

        <LiveDomainCheck />

        <div className="hero-stats" aria-label="Coverage statistics">
          <div>
            <strong>{defaultDomainCount}</strong>
            <span>domains blocked by default</span>
          </div>
          <div>
            <strong>{strictDomainCount}</strong>
            <span>domains in strict mode</span>
          </div>
          <div>
            <strong>{serviceCount}</strong>
            <span>AI services tracked</span>
          </div>
          <div>
            <strong>5</strong>
            <span>export formats</span>
          </div>
        </div>
      </section>

      <section className="landing-section" id="how-it-works">
        <p className="eyebrow">How it works</p>
        <h2>Protected in three steps</h2>
        <div className="steps-grid">
          <article className="step-card">
            <span className="step-number">1</span>
            <KeyRound size={22} />
            <h3>Sign in with your email</h3>
            <p>No passwords to remember — a magic link signs you in securely.</p>
          </article>
          <article className="step-card">
            <span className="step-number">2</span>
            <BadgeCheck size={22} />
            <h3>Pay once with Stripe</h3>
            <p>One-time payment, processed by Stripe. Your license activates automatically.</p>
          </article>
          <article className="step-card">
            <span className="step-number">3</span>
            <Download size={22} />
            <h3>Download rules for your device</h3>
            <p>Pick iPhone, computer, or router and import the file into your blocker of choice.</p>
          </article>
        </div>
      </section>

      <section className="cta-band">
        <div>
          <h2>See what&apos;s inside</h2>
          <p>
            {serviceCount} AI services across 5 categories, five export formats, and a rule pack
            that keeps growing.
          </p>
        </div>
        <div className="cta-band-actions">
          <Link to="/features" className="secondary-button">
            Explore features
          </Link>
          <Link to="/pricing" className="primary-button">
            See pricing
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </div>
  )
}
