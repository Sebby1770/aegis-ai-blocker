import {
  ArrowRight,
  Ban,
  Code2,
  FileDown,
  Globe2,
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
  Zap,
} from 'lucide-react'
import { Link } from '../components/Link'
import { MarketingHeader } from '../components/MarketingHeader'
import { SplitText } from '../components/motion/SplitText'
import { rulePack } from '../lib/blocklists'

const featureCards = [
  {
    Icon: Zap,
    title: 'Live browser enforcement',
    copy: 'The Aegis Enforcer extension blocks AI services in real time via the browser’s declarativeNetRequest engine — switch policy and it updates instantly. Same rule pack as the dashboard.',
  },
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

const categoryIcons: Record<string, typeof Sparkles> = {
  chat: Sparkles,
  search: Search,
  coding: Code2,
  creative: Radar,
  api: Globe2,
}

export function Features() {
  return (
    <div className="landing">
      <MarketingHeader />

      <section className="page-hero">
        <p className="eyebrow">Features</p>
        <SplitText
          as="h1"
          segments={[
            { text: 'Everything you need to switch' },
            { text: 'AI', highlight: true },
            { text: 'off' },
          ]}
        />
        <p className="hero-copy">
          One dashboard turns the rule pack into the right file for every device you own.
        </p>
      </section>

      <section className="landing-section compact-top" data-reveal>
        <div className="feature-grid">
          {featureCards.map(({ Icon, title, copy }) => (
            <article className="feature-card spotlight" key={title}>
              <span className="feature-icon">
                <Icon size={20} />
              </span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
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

      <section className="landing-section" id="coverage" data-reveal>
        <p className="eyebrow">Coverage</p>
        <h2>{rulePack.categories.length} categories, one switch each</h2>
        <div className="coverage-grid">
          {rulePack.categories.map((category) => {
            const Icon = categoryIcons[category.id] ?? ListChecks
            return (
              <article className="coverage-card spotlight" key={category.id}>
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

      <section className="cta-band spotlight" data-reveal>
        <div>
          <h2>One payment covers all of it</h2>
          <p>Every category, every format, every future rule pack update.</p>
        </div>
        <div className="cta-band-actions">
          <Link to="/pricing" className="primary-button">
            See pricing
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </div>
  )
}
