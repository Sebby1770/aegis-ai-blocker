import { ArrowRight } from 'lucide-react'
import { Link } from '../components/Link'
import { MarketingHeader } from '../components/MarketingHeader'
import { SplitText } from '../components/motion/SplitText'

export function Philosophy() {
  return (
    <div className="landing">
      <MarketingHeader />

      <section className="page-hero">
        <p className="eyebrow">Philosophy</p>
        <SplitText
          as="h1"
          segments={[
            { text: 'Choose, maintain, and enforce where' },
            { text: 'AI', highlight: true },
            { text: 'tools are allowed in your digital life' },
          ]}
        />
        <p className="hero-copy">
          Aegis is not an &ldquo;AI is bad&rdquo; tool. It is about intentional digital boundaries —
          deciding, on purpose, when and where AI enters your attention.
        </p>
      </section>

      <section className="landing-section compact-top manifesto" data-reveal>
        <h2>Boundaries are a choice, not a verdict</h2>
        <p className="manifesto-lead">
          Every household, classroom, and workplace draws the line in a different place. Aegis does
          not draw it for you — it gives you the switch.
        </p>

        <div className="belief-grid wide">
          <p><strong>I</strong> choose when AI enters my attention.</p>
          <p><strong>Families</strong> choose what tools their kids can access.</p>
          <p><strong>Schools</strong> choose what counts as fair assistance.</p>
          <p><strong>Workers</strong> choose focus over ambient automation.</p>
        </div>

        <h2>From blocking domains to choosing values</h2>
        <p className="manifesto-body">
          Most blockers make you manage lists of domains. Aegis flips that: you choose a policy —
          Focus, Child-safe, School exam, Workplace compliance, Creative-allowed, Research-allowed —
          and the rules follow. You stop thinking about <code>chatgpt.com</code> and start thinking
          about what the moment needs.
        </p>

        <h2>Trust you can see</h2>
        <p className="manifesto-body">
          A blocklist is only as good as its upkeep, so Aegis makes maintenance visible. Every
          service carries a last-verified date and a breakage-risk label, every block explains
          itself, and the whole <Link to="/catalog">catalog</Link> is public. You are buying
          continued attention, not a one-time file.
        </p>

        <h2>Honest about enforcement</h2>
        <p className="manifesto-body">
          Today Aegis enforces one thing well: <strong>block</strong>, via DNS and content-blocker
          rules that work on devices you already own. Softer boundaries — warn, delay, block-on-a-
          schedule, and rituals like a Sunday rule review — need an always-on agent. That is the
          roadmap, and the <Link to="/changelog">changelog</Link> is where it lands. We would rather
          ship a smaller honest claim than a bigger false one.
        </p>
      </section>

      <section className="cta-band spotlight" data-reveal>
        <div>
          <h2>Set your boundary</h2>
          <p>Pick a policy, see exactly what it blocks, and download it for every device.</p>
        </div>
        <div className="cta-band-actions">
          <Link to="/app/protection" className="secondary-button">
            Explore policies
          </Link>
          <Link to="/pricing" className="primary-button">
            See pricing
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </div>
  )
}
