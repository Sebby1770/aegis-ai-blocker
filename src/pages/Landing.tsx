import {
  ArrowRight,
  BadgeCheck,
  Ban,
  Code2,
  Download,
  FileDown,
  Globe2,
  KeyRound,
  ListChecks,
  Monitor,
  Radar,
  RefreshCcw,
  Router,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
} from 'lucide-react'
import { getActiveDomains, rulePack } from '../lib/blocklists'
import { priceDisplay, useSaas } from '../lib/saas-context'
import { Link } from '../components/Link'
import { navigate } from '../router'

const allCategoriesEnabled = Object.fromEntries(rulePack.categories.map((category) => [category.id, true]))
const defaultDomainCount = getActiveDomains(allCategoriesEnabled, false).length
const strictDomainCount = getActiveDomains(allCategoriesEnabled, true).length
const serviceCount = rulePack.categories.reduce((total, category) => total + category.services.length, 0)

const featureCards = [
  {
    Icon: SlidersHorizontal,
    title: 'Category toggles',
    copy: 'Block AI chat, AI search, AI coding, image/video AI, and AI APIs independently — or all at once.',
  },
  {
    Icon: FileDown,
    title: 'Five export formats',
    copy: 'AdGuard/uBlock DNS filters, hosts file, dnsmasq, plain domains, and Safari content blocker JSON.',
  },
  {
    Icon: Ban,
    title: 'Strict mode',
    copy: 'Extend coverage to broader hosted-model providers when you want maximum blocking.',
  },
  {
    Icon: Radar,
    title: 'Domain tester',
    copy: 'Paste any URL and instantly see whether your current rules would block it.',
  },
  {
    Icon: RefreshCcw,
    title: 'Versioned rule pack',
    copy: 'The blocklist is curated, versioned, and updated as new AI services appear. Buy once, keep the updates.',
  },
  {
    Icon: ShieldCheck,
    title: 'Private by design',
    copy: 'Rules are generated in your browser. No browsing history ever leaves your device.',
  },
]

const faqs = [
  {
    question: 'Does Aegis block every AI service forever?',
    answer:
      'No tool can honestly promise that. Aegis blocks the services in its curated rule pack — currently ' +
      `${serviceCount} services across ${rulePack.categories.length} categories — and the pack is versioned and updated as new services appear. Your lifetime license includes those updates.`,
  },
  {
    question: 'Which devices does it work on?',
    answer:
      'Anything that can consume a DNS blocklist: iPhone and iPad (via DNS blockers or Safari content blockers), desktop browsers with AdGuard or uBlock Origin, and whole-home routers running dnsmasq, Pi-hole, or similar.',
  },
  {
    question: 'Is this a subscription?',
    answer:
      'No. One payment, lifetime access. The exact price is shown at checkout in your local currency, handled securely by Stripe.',
  },
  {
    question: 'What is your refund policy?',
    answer:
      'If Aegis is not for you, request a refund within 14 days of purchase. Refunds automatically deactivate the license. See the refund policy page for details.',
  },
  {
    question: 'What data do you collect?',
    answer:
      'Your account email, license records, and payment events (processed by Stripe — we never see card numbers). No analytics scripts, no ads, no tracking pixels, and your browsing never leaves your device.',
  },
]

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
      <header className="landing-header">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <ShieldCheck size={25} strokeWidth={2.25} />
          </div>
          <div>
            <p className="brand-name">Aegis AI Blocker</p>
            <p className="brand-subtitle">Rule pack {rulePack.version}</p>
          </div>
        </div>
        <nav className="landing-nav" aria-label="Primary">
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
          <Link to="/app" className="secondary-button landing-nav-cta">
            Open dashboard
          </Link>
        </nav>
      </header>

      <section className="hero">
        <p className="hero-eyebrow">
          <BadgeCheck size={16} />
          One payment. Lifetime access. No tracking.
        </p>
        <h1>Block AI tools on every device you own</h1>
        <p className="hero-copy">
          Aegis turns a curated, always-updated catalogue of AI services into ready-to-use blocklists for
          your phone, your browser, and your whole home network. Take back your focus — or your
          family&apos;s — in minutes.
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
        <div className="device-strip" aria-label="Supported targets">
          <span>
            <Smartphone size={17} /> iPhone &amp; iPad
          </span>
          <span>
            <Monitor size={17} /> Desktop browsers
          </span>
          <span>
            <Router size={17} /> Home routers
          </span>
          <span>
            <Globe2 size={17} /> DNS services
          </span>
        </div>
      </section>

      <section className="landing-section" id="features">
        <p className="eyebrow">Features</p>
        <h2>Everything you need to switch AI off</h2>
        <div className="feature-grid">
          {featureCards.map(({ Icon, title, copy }) => (
            <article className="feature-card" key={title}>
              <span className="feature-icon">
                <Icon size={20} />
              </span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section" id="coverage">
        <p className="eyebrow">Coverage</p>
        <h2>{rulePack.categories.length} categories, one switch each</h2>
        <div className="coverage-grid">
          {rulePack.categories.map((category) => {
            const icons: Record<string, typeof Sparkles> = {
              chat: Sparkles,
              search: Search,
              coding: Code2,
              creative: Radar,
              api: Globe2,
            }
            const Icon = icons[category.id] ?? ListChecks
            return (
              <article className="coverage-card" key={category.id}>
                <span className="category-icon" style={{ color: category.color }}>
                  <Icon size={20} />
                </span>
                <div>
                  <h3>{category.name}</h3>
                  <p>{category.description}</p>
                  <small>
                    {category.services.length} services ·{' '}
                    {category.services.reduce((total, service) => total + service.domains.length, 0)} domains
                  </small>
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <section className="landing-section pricing-section" id="pricing">
        <p className="eyebrow">Pricing</p>
        <h2>One price. Yours for life.</h2>
        <div className="pricing-card">
          <p className="pricing-amount">
            {priceDisplay}
            <span> one-time</span>
          </p>
          <ul className="pricing-list">
            <li>
              <BadgeCheck size={17} /> Full rule pack across all {rulePack.categories.length} categories
            </li>
            <li>
              <BadgeCheck size={17} /> All five export formats, unlimited downloads
            </li>
            <li>
              <BadgeCheck size={17} /> Every future rule pack update included
            </li>
            <li>
              <BadgeCheck size={17} /> Strict mode for broader provider blocking
            </li>
            <li>
              <BadgeCheck size={17} /> 14-day refund policy
            </li>
          </ul>
          <button className="primary-button pricing-cta" type="button" onClick={buyNow}>
            {licensed ? 'Lifetime access active' : checkoutLoading ? 'Starting…' : 'Buy lifetime access'}
          </button>
          <p className="pricing-note">
            Final price is shown at checkout in your local currency. Payments are processed by Stripe —
            card details never touch our servers.
          </p>
        </div>
      </section>

      <section className="landing-section" id="faq">
        <p className="eyebrow">FAQ</p>
        <h2>Honest answers</h2>
        <div className="faq-list">
          {faqs.map((faq) => (
            <details className="faq-item" key={faq.question}>
              <summary>{faq.question}</summary>
              <p>{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  )
}
