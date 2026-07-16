import { ArrowRight, BadgeCheck } from 'lucide-react'
import { Link } from '../components/Link'
import { MarketingHeader } from '../components/MarketingHeader'
import { SplitText } from '../components/motion/SplitText'
import { rulePack } from '../lib/blocklists'
import { priceDisplay, useSaas } from '../lib/saas-context'
import { navigate } from '../router'

export function Pricing() {
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
      <MarketingHeader />

      <section className="page-hero">
        <p className="eyebrow">Pricing</p>
        <SplitText
          as="h1"
          segments={[
            { text: 'One price. Yours for' },
            { text: 'life.', highlight: true },
          ]}
        />
        <p className="hero-copy">No subscription, no tiers, no upsells — one payment, every update.</p>
      </section>

      <section className="landing-section compact-top pricing-section" data-reveal>
        <div className="pricing-card spotlight">
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
            Final price is shown at checkout in your local currency. Payments are processed by
            Stripe — card details never touch our servers.
          </p>
          <p className="pricing-note">
            &ldquo;Lifetime&rdquo; means one payment with no renewal, for the operating life of the
            product — see the <Link to="/terms">Terms</Link> for exactly what it covers.
          </p>
        </div>
        <p className="pricing-links">
          Questions first? Read the <Link to="/faq">FAQ</Link> or the{' '}
          <Link to="/refunds">refund policy</Link>.
        </p>
      </section>

      <section className="cta-band spotlight" data-reveal>
        <div>
          <h2>Not ready to buy?</h2>
          <p>The rule builder is free to try — see exactly what you&apos;d get before paying.</p>
        </div>
        <div className="cta-band-actions">
          <Link to="/app" className="primary-button">
            Try the rule builder
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </div>
  )
}
