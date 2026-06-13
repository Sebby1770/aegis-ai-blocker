import { useState } from 'react'
import {
  BadgeCheck,
  CheckCircle2,
  Circle,
  Download,
  KeyRound,
  Monitor,
  Router,
  SlidersHorizontal,
  Smartphone,
} from 'lucide-react'
import { Link } from '../../components/Link'
import { MagicLinkForm } from '../../components/MagicLinkForm'
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

type DeviceId = 'iphone' | 'computer' | 'router'

type DeviceGuide = {
  id: DeviceId
  label: string
  shortLabel: string
  Icon: typeof Smartphone
  format: ExportFormat
  actionLabel: string
  hint: string
}

const deviceGuides: DeviceGuide[] = [
  {
    id: 'iphone',
    label: 'iPhone or iPad',
    shortLabel: 'Best for Apple devices',
    Icon: Smartphone,
    format: 'safari',
    actionLabel: 'Download iOS setup notes',
    hint: 'Add the domains to a DNS blocker such as AdGuard or NextDNS.',
  },
  {
    id: 'computer',
    label: 'Computer browser',
    shortLabel: 'Chrome, Edge, Safari, Firefox',
    Icon: Monitor,
    format: 'adguard',
    actionLabel: 'Download browser rules',
    hint: 'Import the file into AdGuard, uBlock Origin, or your browser blocker.',
  },
  {
    id: 'router',
    label: 'Home router',
    shortLabel: 'Protects the whole household',
    Icon: Router,
    format: 'dnsmasq',
    actionLabel: 'Download router rules',
    hint: 'Add the rules to dnsmasq, Pi-hole, or your router blocking page.',
  },
]

export function Setup() {
  const { session, licensed, checkoutLoading, startCheckout, showToast } = useSaas()
  const { activeDomains } = useRules()
  const [selectedDeviceId, setSelectedDeviceId] = useState<DeviceId>('iphone')

  const selectedDevice = deviceGuides.find((device) => device.id === selectedDeviceId) ?? deviceGuides[0]!
  const currentStep = !session ? 1 : !licensed ? 2 : 3

  const downloadForDevice = () => {
    if (!licensed) {
      void startCheckout()
      return
    }

    if (selectedDevice.id === 'iphone') {
      downloadText('aegis-ios-profile-notes.txt', buildIosProfileGuide(activeDomains))
    } else {
      downloadText(
        `aegis-ai-blocker-${selectedDevice.format}.${extensionForFormat(selectedDevice.format)}`,
        buildExport(selectedDevice.format, activeDomains),
      )
    }

    showToast('Rules downloaded')
  }

  return (
    <>
      <header className="topbar">
        <div>
          <h1>Get protected in three steps</h1>
          <p className="topbar-copy">Sign in, pay once, download the right file for your device. That&apos;s it.</p>
        </div>
      </header>

      <section className="panel onboarding-panel" aria-label="Setup progress">
        <ol className="onboarding-steps">
          <li className={session ? 'done' : currentStep === 1 ? 'current' : ''}>
            <span className="step-state" aria-hidden="true">
              {session ? <CheckCircle2 size={20} /> : <Circle size={20} />}
            </span>
            <div className="step-body">
              <strong>1. Sign in with your email</strong>
              {session ? (
                <p>Signed in. Your license and downloads stay tied to this email.</p>
              ) : (
                <>
                  <p>No password needed — we email you a sign-in link.</p>
                  <MagicLinkForm />
                </>
              )}
            </div>
          </li>

          <li className={licensed ? 'done' : currentStep === 2 ? 'current' : ''}>
            <span className="step-state" aria-hidden="true">
              {licensed ? <CheckCircle2 size={20} /> : <Circle size={20} />}
            </span>
            <div className="step-body">
              <strong>2. Buy lifetime access</strong>
              {licensed ? (
                <p>Lifetime license active — every future rule pack update is included.</p>
              ) : (
                <>
                  <p>One payment, processed by Stripe. Refundable for 14 days.</p>
                  {session && (
                    <button className="primary-button" type="button" onClick={() => void startCheckout()}>
                      <KeyRound size={17} />
                      {checkoutLoading ? 'Starting…' : 'Buy lifetime access'}
                    </button>
                  )}
                </>
              )}
            </div>
          </li>

          <li className={currentStep === 3 ? 'current' : ''}>
            <span className="step-state" aria-hidden="true">
              {licensed ? <Download size={20} /> : <Circle size={20} />}
            </span>
            <div className="step-body">
              <strong>3. Download rules for your device</strong>
              <p>Pick what you want to protect — we choose the right file format for you.</p>

              <div className="device-picker" aria-label="Device type">
                {deviceGuides.map((device) => {
                  const Icon = device.Icon
                  const selected = device.id === selectedDevice.id

                  return (
                    <button
                      key={device.id}
                      className={`device-option ${selected ? 'selected' : ''}`}
                      type="button"
                      onClick={() => setSelectedDeviceId(device.id)}
                    >
                      <Icon size={21} />
                      <span>
                        <strong>{device.label}</strong>
                        <small>{device.shortLabel}</small>
                      </span>
                    </button>
                  )
                })}
              </div>

              <div className="recommended-format">
                <span>Recommended file</span>
                <strong>{exportLabels[selectedDevice.format]}</strong>
              </div>
              <p className="device-hint">{selectedDevice.hint}</p>

              <button className="primary-button" type="button" onClick={downloadForDevice}>
                {licensed ? <Download size={18} /> : <KeyRound size={18} />}
                {licensed ? selectedDevice.actionLabel : checkoutLoading ? 'Starting…' : 'Buy once, then download'}
              </button>
            </div>
          </li>
        </ol>
      </section>

      <section className="setup-links">
        <Link to="/app/protection" className="secondary-button">
          <BadgeCheck size={16} />
          Choose what gets blocked
        </Link>
        <Link to="/app/blocklists" className="secondary-button">
          <SlidersHorizontal size={16} />
          Advanced export formats
        </Link>
      </section>
    </>
  )
}
