import { useMemo, useState } from 'react'
import {
  Activity,
  Ban,
  CheckCircle2,
  Clipboard,
  Code2,
  Download,
  FileDown,
  Globe2,
  KeyRound,
  LockKeyhole,
  Radar,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  WifiOff,
} from 'lucide-react'
import './App.css'
import {
  buildExport,
  buildIosProfileGuide,
  exportLabels,
  extensionForFormat,
  getActiveDomains,
  getActiveServices,
  isDomainBlocked,
  rulePack,
  type ExportFormat,
} from './lib/blocklists'

const defaultEnabled = Object.fromEntries(rulePack.categories.map((category) => [category.id, true]))

const categoryIcons: Record<string, typeof Sparkles> = {
  chat: Sparkles,
  search: Search,
  coding: Code2,
  creative: Radar,
  api: Globe2,
}

const formats: ExportFormat[] = ['adguard', 'hosts', 'dnsmasq', 'plain', 'safari']

const sampleEvents = [
  { domain: 'chatgpt.com', category: 'AI Chat', app: 'Safari', time: '14:42' },
  { domain: 'api.githubcopilot.com', category: 'AI Coding', app: 'VS Code', time: '14:37' },
  { domain: 'perplexity.ai', category: 'AI Search', app: 'Chrome', time: '14:31' },
  { domain: 'api.openai.com', category: 'AI APIs', app: 'Terminal', time: '14:20' },
]

function App() {
  const [enabledCategories, setEnabledCategories] = useState<Record<string, boolean>>(defaultEnabled)
  const [strictMode, setStrictMode] = useState(false)
  const [exportFormat, setExportFormat] = useState<ExportFormat>('adguard')
  const [testUrl, setTestUrl] = useState('claude.ai')
  const [licenseActive, setLicenseActive] = useState(true)
  const [toast, setToast] = useState('')

  const activeDomains = useMemo(
    () => getActiveDomains(enabledCategories, strictMode),
    [enabledCategories, strictMode],
  )
  const activeServices = useMemo(
    () => getActiveServices(enabledCategories, strictMode),
    [enabledCategories, strictMode],
  )
  const exportPreview = useMemo(
    () => buildExport(exportFormat, activeDomains).split('\n').slice(0, 11).join('\n'),
    [activeDomains, exportFormat],
  )
  const testResult = useMemo(() => isDomainBlocked(testUrl, activeDomains), [activeDomains, testUrl])

  const showToast = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2200)
  }

  const copyRules = async () => {
    await navigator.clipboard.writeText(buildExport(exportFormat, activeDomains))
    showToast('Rules copied')
  }

  const downloadText = (name: string, text: string) => {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = name
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const downloadRules = () => {
    downloadText(
      `aegis-ai-blocker-${exportFormat}.${extensionForFormat(exportFormat)}`,
      buildExport(exportFormat, activeDomains),
    )
    showToast('Rules downloaded')
  }

  const downloadProfile = () => {
    downloadText('aegis-ios-profile-notes.txt', buildIosProfileGuide(activeDomains))
    showToast('iOS notes downloaded')
  }

  const toggleCategory = (id: string) => {
    setEnabledCategories((current) => ({ ...current, [id]: !current[id] }))
  }

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Aegis navigation">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <ShieldCheck size={25} strokeWidth={2.25} />
          </div>
          <div>
            <p className="brand-name">Aegis AI Blocker</p>
            <p className="brand-subtitle">Rule pack {rulePack.version}</p>
          </div>
        </div>

        <nav className="nav-list" aria-label="Sections">
          <a className="nav-item active" href="#protection">
            <ShieldCheck size={18} />
            Protection
          </a>
          <a className="nav-item" href="#blocklists">
            <WifiOff size={18} />
            Blocklists
          </a>
          <a className="nav-item" href="#license">
            <KeyRound size={18} />
            License
          </a>
        </nav>

        <section className="license-panel" id="license">
          <div className="license-icon" aria-hidden="true">
            <LockKeyhole size={20} />
          </div>
          <p className="panel-title">Lifetime license</p>
          <p className="license-state">{licenseActive ? 'Unlocked locally' : 'Activation needed'}</p>
          <button className="soft-button" type="button" onClick={() => setLicenseActive((value) => !value)}>
            {licenseActive ? 'Deactivate demo' : 'Activate demo'}
          </button>
        </section>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>Protection live</h1>
            <p className="topbar-copy">Known limitation: new AI services need rule updates.</p>
          </div>
          <div className="topbar-actions">
            <button className="icon-button" type="button" onClick={copyRules} aria-label="Copy DNS rules" title="Copy DNS rules">
              <Clipboard size={18} />
            </button>
            <button className="primary-button" type="button" onClick={downloadRules}>
              <Download size={18} />
              Export rules
            </button>
          </div>
        </header>

        <section className="summary-grid" id="protection">
          <article className="status-card protection-card">
            <div className="status-row">
              <div className="status-orb" aria-hidden="true">
                <CheckCircle2 size={24} />
              </div>
              <div>
                <p className="eyebrow">Active coverage</p>
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
            <h2>{activeServices.length}</h2>
            <p>Tracked providers</p>
          </article>

          <article className="status-card compact">
            <p className="eyebrow">Strict mode</p>
            <button className="toggle-control" type="button" onClick={() => setStrictMode((value) => !value)}>
              {strictMode ? <ToggleRight size={36} /> : <ToggleLeft size={36} />}
              {strictMode ? 'On' : 'Off'}
            </button>
          </article>
        </section>

        <section className="content-grid">
          <section className="panel blocklist-panel" id="blocklists">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Blocklists</p>
                <h2>AI categories</h2>
              </div>
              <SlidersHorizontal size={20} />
            </div>

            <div className="category-list">
              {rulePack.categories.map((category) => {
                const Icon = categoryIcons[category.id] ?? Ban
                const enabled = enabledCategories[category.id]
                const domainCount = category.services.reduce(
                  (total, service) => total + (strictMode || !service.strictOnly ? service.domains.length : 0),
                  0,
                )

                return (
                  <button
                    key={category.id}
                    className={`category-row ${enabled ? 'enabled' : ''}`}
                    type="button"
                    onClick={() => toggleCategory(category.id)}
                  >
                    <span className="category-icon" style={{ color: category.color }}>
                      <Icon size={21} />
                    </span>
                    <span className="category-copy">
                      <strong>{category.name}</strong>
                      <span>{domainCount} domains</span>
                    </span>
                    <span className="row-switch" aria-hidden="true">
                      {enabled ? <ToggleRight size={34} /> : <ToggleLeft size={34} />}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="panel export-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Export rules</p>
                <h2>{exportLabels[exportFormat]}</h2>
              </div>
              <FileDown size={20} />
            </div>

            <div className="format-tabs" role="tablist" aria-label="Export format">
              {formats.map((format) => (
                <button
                  key={format}
                  className={format === exportFormat ? 'active' : ''}
                  type="button"
                  onClick={() => setExportFormat(format)}
                >
                  {exportLabels[format]}
                </button>
              ))}
            </div>

            <pre className="export-preview" aria-label="Export preview">
              {exportPreview}
            </pre>

            <div className="button-row">
              <button className="secondary-button" type="button" onClick={copyRules}>
                <Clipboard size={17} />
                Copy DNS rules
              </button>
              <button className="secondary-button" type="button" onClick={downloadProfile}>
                <Download size={17} />
                Download profile
              </button>
            </div>
          </section>

          <section className="panel tester-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Rule tester</p>
                <h2>Check a domain</h2>
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
                {testResult.blocked ? `Blocked by ${testResult.matchedDomain}` : 'Allowed by current rules'}
              </span>
            </div>
          </section>

          <section className="panel activity-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Recent blocks</p>
                <h2>Live sample</h2>
              </div>
              <Radar size={20} />
            </div>
            <div className="activity-list">
              {sampleEvents.map((event) => (
                <div className="activity-row" key={`${event.domain}-${event.time}`}>
                  <span className="activity-dot" />
                  <div>
                    <strong>{event.domain}</strong>
                    <span>
                      {event.category} via {event.app}
                    </span>
                  </div>
                  <time>{event.time}</time>
                </div>
              ))}
            </div>
          </section>
        </section>
      </section>

      <div className={`toast ${toast ? 'show' : ''}`} role="status" aria-live="polite">
        {toast}
      </div>
    </main>
  )
}

export default App
