import { useMemo, useState } from 'react'
import {
  Activity,
  Ban,
  CheckCircle2,
  ChevronDown,
  Code2,
  Globe2,
  Radar,
  Search,
  SlidersHorizontal,
  Sparkles,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react'
import { isDomainBlocked, rulePack } from '../../lib/blocklists'
import { useRules } from '../../lib/rules-context'

const categoryIcons: Record<string, typeof Sparkles> = {
  chat: Sparkles,
  search: Search,
  coding: Code2,
  creative: Radar,
  api: Globe2,
}

export function Protection() {
  const { enabledCategories, strictMode, activeDomains, activeServiceCount, toggleCategory, setStrictMode } =
    useRules()
  const [testUrl, setTestUrl] = useState('claude.ai')
  const [expanded, setExpanded] = useState<string | null>(null)

  const testResult = useMemo(() => isDomainBlocked(testUrl, activeDomains), [activeDomains, testUrl])

  return (
    <>
      <header className="topbar">
        <div>
          <h1>Choose what gets blocked</h1>
          <p className="topbar-copy">
            Flip a category on or off — every export you download uses these choices.
          </p>
        </div>
        <button className="strict-chip" type="button" onClick={() => setStrictMode(!strictMode)}>
          <SlidersHorizontal size={16} />
          Strict mode {strictMode ? 'on' : 'off'}
        </button>
      </header>

      <section className="summary-grid">
        <article className="status-card protection-card">
          <div className="status-row">
            <div className="status-orb" aria-hidden="true">
              <CheckCircle2 size={24} />
            </div>
            <div>
              <p className="eyebrow">Currently blocking</p>
              <h2>{activeDomains.length} domains</h2>
            </div>
          </div>
          <div className="coverage-bars" aria-label="Coverage by category">
            {rulePack.categories.map((category) => (
              <span
                key={category.id}
                style={{
                  backgroundColor: enabledCategories[category.id] ? category.color : '#d8dde2',
                  flexGrow: enabledCategories[category.id] ? 2 : 0.7,
                }}
              />
            ))}
          </div>
        </article>

        <article className="status-card compact">
          <p className="eyebrow">Services</p>
          <h2>{activeServiceCount}</h2>
          <p>AI providers blocked</p>
        </article>

        <article className="status-card compact">
          <p className="eyebrow">Strict mode</p>
          <h2>{strictMode ? 'On' : 'Off'}</h2>
          <p>{strictMode ? 'Broader providers included' : 'Adds broader providers'}</p>
        </article>
      </section>

      <section className="content-grid protection-grid">
        <section className="panel" aria-label="Categories">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Categories</p>
              <h2>Tap a category to switch it</h2>
            </div>
          </div>

          <div className="category-list">
            {rulePack.categories.map((category) => {
              const Icon = categoryIcons[category.id] ?? Ban
              const enabled = enabledCategories[category.id]
              const services = category.services.filter((service) => strictMode || !service.strictOnly)
              const domainCount = services.reduce((total, service) => total + service.domains.length, 0)
              const isExpanded = expanded === category.id

              return (
                <div key={category.id} className={`category-block ${enabled ? 'enabled' : ''}`}>
                  <div className="category-row-line">
                    <button
                      className={`category-row ${enabled ? 'enabled' : ''}`}
                      type="button"
                      onClick={() => toggleCategory(category.id)}
                      aria-pressed={enabled}
                    >
                      <span className="category-icon" style={{ color: category.color }}>
                        <Icon size={21} />
                      </span>
                      <span className="category-copy">
                        <strong>{category.name}</strong>
                        <span>
                          {services.length} services · {domainCount} domains
                        </span>
                      </span>
                      <span className="row-switch" aria-hidden="true">
                        {enabled ? <ToggleRight size={34} /> : <ToggleLeft size={34} />}
                      </span>
                    </button>
                    <button
                      className={`expand-chip ${isExpanded ? 'open' : ''}`}
                      type="button"
                      onClick={() => setExpanded(isExpanded ? null : category.id)}
                      aria-expanded={isExpanded}
                      aria-label={`Show services in ${category.name}`}
                    >
                      <ChevronDown size={16} />
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="service-chips" aria-label={`${category.name} services`}>
                      {services.map((service) => (
                        <span key={service.name} className="service-chip">
                          {service.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        <section className="panel tester-panel" aria-label="Rule tester">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Rule tester</p>
              <h2>Would this site be blocked?</h2>
            </div>
            <Activity size={20} />
          </div>
          <label className="tester-input">
            <span>URL or domain</span>
            <input value={testUrl} onChange={(event) => setTestUrl(event.target.value)} placeholder="chatgpt.com" />
          </label>
          <div className={`test-result ${testResult.blocked ? 'blocked' : 'allowed'}`}>
            {testResult.blocked ? <Ban size={18} /> : <CheckCircle2 size={18} />}
            <span>
              {testResult.blocked ? `Blocked by the ${testResult.matchedDomain} rule` : 'Allowed by your current rules'}
            </span>
          </div>
          <p className="tester-note">
            Tested against your category choices above, live in your browser.
          </p>
        </section>
      </section>
    </>
  )
}
