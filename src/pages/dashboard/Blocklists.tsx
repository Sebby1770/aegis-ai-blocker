import { Clipboard, Download, FileDown, KeyRound } from 'lucide-react'
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
  const { activeDomains, exportFormat, setExportFormat } = useRules()

  const exportPreview = buildExport(exportFormat, activeDomains).split('\n').slice(0, 12).join('\n')

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

    await navigator.clipboard.writeText(buildExport(exportFormat, activeDomains))
    showToast('Rules copied')
  }

  const downloadRules = () => {
    if (!requireLicense()) {
      return
    }

    downloadText(
      `aegis-ai-blocker-${exportFormat}.${extensionForFormat(exportFormat)}`,
      buildExport(exportFormat, activeDomains),
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
    </>
  )
}
