import { ArrowRight } from 'lucide-react'
import { Link } from '../components/Link'
import { MarketingHeader } from '../components/MarketingHeader'
import { rulePack } from '../lib/blocklists'
import { serviceCount } from '../lib/marketing'

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
  {
    question: 'How do rule pack updates reach me?',
    answer:
      'Open the dashboard and download fresh files any time — your license includes every update. The current pack version is always shown in the header, and changes are documented in the public changelog.',
  },
]

export function Faq() {
  return (
    <div className="landing">
      <MarketingHeader />

      <section className="page-hero">
        <p className="eyebrow">FAQ</p>
        <h1>Honest answers</h1>
        <p className="hero-copy">If your question is not here, open a support request on GitHub.</p>
      </section>

      <section className="landing-section compact-top">
        <div className="faq-list">
          {faqs.map((faq) => (
            <details className="faq-item" key={faq.question}>
              <summary>{faq.question}</summary>
              <p>{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="cta-band">
        <div>
          <h2>Ready when you are</h2>
          <p>Pick a device, sign in, pay once — protected in minutes.</p>
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
