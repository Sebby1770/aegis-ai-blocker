import { Link } from '../components/Link'
import { PageShell } from '../components/PageShell'

const newIssueUrl = 'https://github.com/Sebby1770/aegis-ai-blocker/issues/new'
const serviceRequestUrl =
  'https://github.com/Sebby1770/aegis-ai-blocker/issues/new?title=Service%20request%3A%20'

export function Support() {
  return (
    <PageShell title="Support" intro="Questions, problems, and rule pack requests — all in one place.">
      <h2>Get help</h2>
      <p>
        The fastest way to reach us is a{' '}
        <a href={newIssueUrl} rel="noreferrer" target="_blank">
          GitHub support request
        </a>
        . Issues are public, so describe the problem but never post receipts, emails, or payment
        details there. For billing questions, reply directly to your Stripe receipt email instead —
        it reaches us privately and already identifies your purchase.
      </p>

      <h2>Quick fixes</h2>
      <ul>
        <li>
          <strong>Sign-in link expired or never arrived.</strong> Request a new one from the
          dashboard — links are single-use and short-lived. Check spam the first time.
        </li>
        <li>
          <strong>Paid, but exports are still locked.</strong> Licenses activate within seconds of
          payment via Stripe&apos;s webhook. If the banner has not flipped, press{' '}
          <em>Refresh license</em> in the dashboard account panel, or sign out and back in with the
          same email you paid with.
        </li>
        <li>
          <strong>A blocked site stopped being blocked.</strong> Services move domains. Download a
          fresh export from the dashboard — your license includes every rule pack update — and check
          the <Link to="/changelog">changelog</Link> for what changed.
        </li>
        <li>
          <strong>Want your money back?</strong> No hard feelings — see the{' '}
          <Link to="/refunds">refund policy</Link>. Refunds within 14 days, no hoops.
        </li>
      </ul>

      <h2>Request a service to block</h2>
      <p>
        Found an AI tool the pack misses? <a href={serviceRequestUrl} rel="noreferrer" target="_blank">Open a
        service request</a> with the site or API domain. Coverage requests directly shape the next
        rule pack release.
      </p>

      <h2>Security issues</h2>
      <p>
        Please do not report vulnerabilities in public issues — use the process on the{' '}
        <Link to="/security">security page</Link> instead.
      </p>
    </PageShell>
  )
}
