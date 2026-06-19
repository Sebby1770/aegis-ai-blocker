import { useMemo, useState } from 'react'
import {
  Ban,
  CheckCircle2,
  ChevronDown,
  Code2,
  Globe2,
  Info,
  Radar,
  Search,
  ShieldQuestion,
  SlidersHorizontal,
  Sparkles,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react'
import { rulePack, type BreakageRisk } from '../../lib/blocklists'
import { breakageLabels, explainDomain } from '../../lib/explain'
import { CUSTOM_POLICY_ID, policies } from '../../lib/policies'
import { useRules } from '../../lib/rules-context'

const categoryIcons: Record<string, typeof Sparkles> = {
  chat: Sparkles,
  search: Search,
  coding: Code2,
  creative: Radar,
  api: Globe2,
}

const riskClass: Record<BreakageRisk, string> = {
  low: 'risk-low',
  medium: 'risk-medium',
  high: 'risk-high',
}

export function Protection() {
  const {
    enabledCategories,
    strictMode,
    activeDomains,
    activeServiceCount,
    activePolicyId,
    allowDomains,
    blockDomains,
    toggleCategory,
    setStrictMode,
    applyPolicy,
  } = useRules()
  const [testUrl, setTestUrl] = useState('claude.ai')
  const [expanded, setExpanded] = useState<string | null>(null)

  const explanation = useMemo(
    () => explainDomain(testUrl, strictMode, { allow: allowDomains, block: blockDomains }),
    [strictMode, testUrl, allowDomains, blockDomains],
  )
  const activePolicy = policies.find((policy) => policy.id === activePolicyId)

  return (
    <>
      <header className="topbar">
        <div>
          <h1>Choose your AI policy</h1>
          <p className="topbar-copy">
            Pick the boundary that matches the moment — or fine-tune categories below. Every export
            you download follows this policy.
          </p>
        </div>
        <button className="strict-chip" type="button" onClick={() => setStrictMode(!strictMode)}>
          <SlidersHorizontal size={16} />
          Strict mode {strictMode ? 'on' : 'off'}
        </button>
      </header>

      <section className="panel policy-panel" aria-label="Policy modes">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Modes</p>
            <h2>Choose a value, not a domain list</h2>
          </div>
          <span className={`policy-status ${activePolicyId === CUSTOM_POLICY_ID ? 'custom' : ''}`}>
            {activePolicy ? activePolicy.name : 'Custom policy'}
          </span>
        </div>

        <div className="policy-grid">
          {policies.map((policy) => {
            const selected = policy.id === activePolicyId
            return (
              <button
                key={policy.id}
                type="button"
                className={`policy-card ${selected ? 'selected' : ''}`}
                onClick={() => applyPolicy(policy.id)}
                aria-pressed={selected}
              >
                <span className="policy-space">{policy.space}</span>
                <strong>{policy.name}</strong>
                <small>{policy.tagline}</small>
                <span className="policy-recommended">{policy.recommendedFor}</span>
              </button>
            )
          })}
        </div>
        {activePolicyId === CUSTOM_POLICY_ID && (
          <p className="policy-custom-note">
            <Info size={14} />
            You&apos;ve tuned categories by hand — this is a custom policy. Pick a mode above to reset.
          </p>
        )}
      </section>

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
              <p className="eyebrow">Fine-tune</p>
              <h2>Categories</h2>
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
                    <ul className="service-rows" aria-label={`${category.name} services`}>
                      {services.map((service) => (
                        <li key={service.name} className="service-row">
                          <span className="service-name">{service.name}</span>
                          <span className="service-meta">
                            <span className={`risk-badge ${riskClass[service.breakageRisk]}`} title={breakageLabels[service.breakageRisk]}>
                              {service.breakageRisk}
                            </span>
                            {service.strictOnly && <span className="strict-badge">strict only</span>}
                          </span>
                          {service.note && <span className="service-note">{service.note}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        <section className="panel tester-panel" aria-label="Rule tester">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Why is it blocked?</p>
              <h2>Explain any domain</h2>
            </div>
            <ShieldQuestion size={20} />
          </div>
          <label className="tester-input">
            <span>URL or domain</span>
            <input value={testUrl} onChange={(event) => setTestUrl(event.target.value)} placeholder="chatgpt.com" />
          </label>

          <div className={`explain-result explain-${explanation.status}`}>
            <strong>
              {explanation.status === 'blocked' && 'Blocked'}
              {explanation.status === 'strict-only' && 'Allowed (strict mode off)'}
              {explanation.status === 'allowed' && 'Allowed'}
            </strong>
            <p>{explanation.reason}</p>
            {explanation.owner && (
              <div className="explain-tags">
                <span className={`risk-badge ${riskClass[explanation.owner.breakageRisk]}`}>
                  {breakageLabels[explanation.owner.breakageRisk]}
                </span>
                {explanation.owner.strictOnly && <span className="strict-badge">strict only</span>}
                {explanation.matchType === 'parent' && <span className="match-badge">parent-domain match</span>}
              </div>
            )}
            {explanation.owner?.note && <p className="explain-note">{explanation.owner.note}</p>}
          </div>
          <p className="tester-note">Explained live in your browser against your current policy.</p>
        </section>
      </section>
    </>
  )
}
