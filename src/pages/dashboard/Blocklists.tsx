import { useState, type FormEvent, type ReactNode } from 'react'
import { Clipboard, Download, FileDown, KeyRound, Plus, ShieldBan, ShieldCheck, X } from 'lucide-react'
import { Link } from '../../components/Link'
import {
  buildExport,
  buildIosProfileGuide,
  exportLabels,
  extensionForFormat,
  type ExportFormat,
} from '../../lib/blocklists'
import { downloadText } from '../../lib/download'
import { useRules } from '../../lib/rules-context'
import type { ExceptionKind } from '../../lib/rules-context'
import { useSaas } from '../../lib/saas-context'

const formats: ExportFormat[] = ['adguard', 'hosts', 'dnsmasq', 'plain', 'safari']

const formatHints: Record<ExportFormat, string> = {
  adguard: 'For AdGuard, uBlock Origin, and most browser blockers.',
  hosts: 'For computers — drop into /etc/hosts or your hosts file manager.',
  dnsmasq: 'For routers and Pi-hole style DNS servers.',
  plain: 'One domain per line — for any tool that takes a custom list.',
  safari: 'JSON for Safari content blocker extensions on Apple devices.',
}

export function Blocklists() {
  const { licensed, checkoutLoading, startCheckout, showToast } = useSaas()
  const { activeDomains, activeAllowed, exportFormat, setExportFormat } = useRules()

  const exportPreview = buildExport(exportFormat, activeDomains, activeAllowed)
    .split('\n')
    .slice(0, 12)
    .join('\n')

  const requireLicense = () => {
    if (licensed) {
      return true
    }

    void startCheckout()
    return false
  }

  const copyRules = async () => {
    if (!requireLicense()) {
      return
    }

    await navigator.clipboard.writeText(buildExport(exportFormat, activeDomains, activeAllowed))
    showToast('Rules copied')
  }

  const downloadRules = () => {
    if (!requireLicense()) {
      return
    }

    downloadText(
      `aegis-ai-blocker-${exportFormat}.${extensionForFormat(exportFormat)}`,
      buildExport(exportFormat, activeDomains, activeAllowed),
    )
    showToast('Rules downloaded')
  }

  const downloadProfile = () => {
    if (!requireLicense()) {
      return
    }

    downloadText('aegis-ios-profile-notes.txt', buildIosProfileGuide(activeDomains))
    showToast('iOS notes downloaded')
  }

  return (
    <>
      <header className="topbar">
        <div>
          <h1>Export your blocklist</h1>
          <p className="topbar-copy">
            Pick a format, then copy or download. Exports always use your{' '}
            <Link to="/app/protection" className="inline-link">
              Protection
            </Link>{' '}
            choices.
          </p>
        </div>
      </header>

      <section className="panel export-panel-page" aria-label="Export formats">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Format</p>
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
              role="tab"
              aria-selected={format === exportFormat}
              onClick={() => setExportFormat(format)}
            >
              {exportLabels[format]}
            </button>
          ))}
        </div>

        <p className="format-hint">{formatHints[exportFormat]}</p>

        <pre className="export-preview" aria-label="Export preview">
          {licensed ? exportPreview : `${exportPreview}\n# Sign in and buy lifetime access to export the full list.`}
        </pre>

        <div className="button-row">
          <button className="primary-button" type="button" onClick={downloadRules}>
            {licensed ? <Download size={17} /> : <KeyRound size={17} />}
            {licensed ? 'Download file' : checkoutLoading ? 'Starting…' : 'Buy to download'}
          </button>
          <button className="secondary-button" type="button" onClick={copyRules}>
            <Clipboard size={17} />
            Copy to clipboard
          </button>
          <button className="secondary-button" type="button" onClick={downloadProfile}>
            <Download size={17} />
            iOS setup notes
          </button>
        </div>

        {licensed && (
          <p className="automation-note">
            Automating updates? Licensed accounts can also fetch canonical files from{' '}
            <code>GET /api/export?format={exportFormat}</code> with a bearer token.
          </p>
        )}
      </section>

      <ExceptionsPanel />
    </>
  )
}

function ExceptionsPanel() {
  const { allowDomains, blockDomains, addException, removeException } = useRules()

  return (
    <section className="panel exceptions-panel" aria-label="Domain exceptions">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Fine print</p>
          <h2>Exceptions</h2>
        </div>
        <ShieldCheck size={20} />
      </div>
      <p className="format-hint">
        Override the policy for specific domains. <strong>Always allow</strong> keeps a domain
        reachable even when a category would block it (e.g. allow Copilot for work);{' '}
        <strong>also block</strong> adds your own domains on top of the pack. Exceptions flow into
        every export — AdGuard, dnsmasq and Safari get real allow rules; hosts and plain lists note
        anything they can&apos;t express.
      </p>

      <div className="exceptions-grid">
        <ExceptionList
          kind="allow"
          title="Always allow"
          icon={<ShieldCheck size={16} />}
          domains={allowDomains}
          placeholder="github.com"
          emptyText="No allow exceptions yet."
          addException={addException}
          removeException={removeException}
        />
        <ExceptionList
          kind="block"
          title="Also block"
          icon={<ShieldBan size={16} />}
          domains={blockDomains}
          placeholder="my-internal-ai.example.com"
          emptyText="No extra blocked domains yet."
          addException={addException}
          removeException={removeException}
        />
      </div>
    </section>
  )
}

function ExceptionList({
  kind,
  title,
  icon,
  domains,
  placeholder,
  emptyText,
  addException,
  removeException,
}: {
  kind: ExceptionKind
  title: string
  icon: ReactNode
  domains: string[]
  placeholder: string
  emptyText: string
  addException: (kind: ExceptionKind, domain: string) => string | null
  removeException: (kind: ExceptionKind, domain: string) => void
}) {
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const listId = `exception-list-${kind}`

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = draft.trim()
    if (!trimmed) {
      return
    }
    const added = addException(kind, trimmed)
    if (added) {
      setDraft('')
      setError('')
    } else {
      setError(`"${trimmed}" doesn't look like a domain.`)
    }
  }

  return (
    <div className={`exception-column exception-${kind}`}>
      <h3 className="exception-title">
        {icon}
        {title}
      </h3>
      <form className="exception-form" onSubmit={submit}>
        <label className="sr-only" htmlFor={`exception-input-${kind}`}>
          Add a domain to {title.toLowerCase()}
        </label>
        <input
          id={`exception-input-${kind}`}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value)
            if (error) {
              setError('')
            }
          }}
          placeholder={placeholder}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `exception-error-${kind}` : undefined}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
        <button className="secondary-button" type="submit" aria-label={`Add to ${title}`}>
          <Plus size={16} />
          Add
        </button>
      </form>
      {error && (
        <p className="exception-error" id={`exception-error-${kind}`} role="alert">
          {error}
        </p>
      )}
      {domains.length === 0 ? (
        <p className="exception-empty">{emptyText}</p>
      ) : (
        <ul className="exception-chips" id={listId} aria-label={`${title} domains`}>
          {domains.map((domain) => (
            <li key={domain} className="exception-chip">
              <span>{domain}</span>
              <button
                type="button"
                aria-label={`Remove ${domain}`}
                onClick={() => removeException(kind, domain)}
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
