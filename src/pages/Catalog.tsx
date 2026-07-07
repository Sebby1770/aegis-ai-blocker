import { useMemo, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { Link } from '../components/Link'
import { MarketingHeader } from '../components/MarketingHeader'
import { CountUp } from '../components/motion/CountUp'
import { SplitText } from '../components/motion/SplitText'
import { rulePack, type BreakageRisk } from '../lib/blocklists'
import { breakageLabels } from '../lib/explain'
import { defaultDomainCount, serviceCount } from '../lib/marketing'

const riskClass: Record<BreakageRisk, string> = {
  low: 'risk-low',
  medium: 'risk-medium',
  high: 'risk-high',
}

export function Catalog() {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()

    return rulePack.categories
      .map((category) => ({
        category,
        services: category.services.filter(
          (service) =>
            !term ||
            service.name.toLowerCase().includes(term) ||
            service.domains.some((domain) => domain.includes(term)),
        ),
      }))
      .filter((group) => group.services.length > 0)
  }, [query])

  const riskCounts = useMemo(() => {
    const counts = { low: 0, medium: 0, high: 0 }
    for (const category of rulePack.categories) {
      for (const service of category.services) {
        counts[service.breakageRisk] += 1
      }
    }
    return counts
  }, [])

  return (
    <div className="landing">
      <MarketingHeader />

      <section className="page-hero">
        <p className="eyebrow">Catalog</p>
        <SplitText
          as="h1"
          segments={[
            { text: 'Every rule, in the' },
            { text: 'open', highlight: true },
          ]}
        />
        <p className="hero-copy">
          Aegis is a maintained garden, not a static download. Here is every service we track, what
          it belongs to, when it was last verified, and how likely it is to affect anything else.
        </p>
      </section>

      <section className="landing-section compact-top">
        <div className="catalog-stats" aria-label="Catalog statistics">
          <div>
            <strong>
              <CountUp end={serviceCount} />
            </strong>
            <span>services tracked</span>
          </div>
          <div>
            <strong>
              <CountUp end={defaultDomainCount} />
            </strong>
            <span>domains by default</span>
          </div>
          <div>
            <strong>{rulePack.updatedAt}</strong>
            <span>last verified</span>
          </div>
          <div>
            <strong>
              <CountUp end={rulePack.policies.length} />
            </strong>
            <span>policy modes</span>
          </div>
        </div>

        <div className="catalog-legend">
          <span className="risk-badge risk-low">low</span> {riskCounts.low} ·
          <span className="risk-badge risk-medium">medium</span> {riskCounts.medium} ·
          <span className="risk-badge risk-high">high</span> {riskCounts.high} breakage risk. Higher
          risk means the service shares domains with non-AI tools.
        </div>

        <label className="catalog-search">
          <span className="sr-only">Search services or domains</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search a service or domain — e.g. ChatGPT, bing.com"
            autoComplete="off"
            spellCheck={false}
          />
        </label>

        {filtered.length === 0 ? (
          <p className="catalog-empty">No services match “{query}”.</p>
        ) : (
          filtered.map(({ category, services }) => (
            <div className="catalog-category" key={category.id}>
              <h2 style={{ color: category.color }}>{category.name}</h2>
              <p className="catalog-category-desc">{category.description}</p>
              <div className="catalog-grid">
                {services.map((service) => (
                  <article className="catalog-card spotlight" key={service.name}>
                    <div className="catalog-card-head">
                      <strong>{service.name}</strong>
                      <span className={`risk-badge ${riskClass[service.breakageRisk]}`} title={breakageLabels[service.breakageRisk]}>
                        {service.breakageRisk}
                      </span>
                    </div>
                    <div className="catalog-domains">
                      {service.domains.map((domain) => (
                        <code key={domain}>{domain}</code>
                      ))}
                    </div>
                    {service.note && <p className="catalog-note">{service.note}</p>}
                    <div className="catalog-card-foot">
                      <span>Verified {service.verified}</span>
                      {service.strictOnly && <span className="strict-badge">strict only</span>}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))
        )}
      </section>

      <section className="cta-band spotlight" data-reveal>
        <div>
          <h2>Found one we miss?</h2>
          <p>Coverage requests shape the next rule pack. Tell us what to add.</p>
        </div>
        <div className="cta-band-actions">
          <Link to="/support" className="secondary-button">
            <ShieldCheck size={16} />
            Request a service
          </Link>
          <Link to="/app" className="primary-button">
            Open the dashboard
          </Link>
        </div>
      </section>
    </div>
  )
}
