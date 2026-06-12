import { PageShell } from '../components/PageShell'

const advisoryUrl = 'https://github.com/Sebby1770/aegis-ai-blocker/security/advisories/new'
const policyUrl = 'https://github.com/Sebby1770/aegis-ai-blocker/blob/main/SECURITY.md'

export function SecurityPolicy() {
  return (
    <PageShell title="Security" intro="How to report a vulnerability, and how Aegis is hardened.">
      <h2>Reporting a vulnerability</h2>
      <p>
        Report security issues privately through{' '}
        <a href={advisoryUrl} rel="noreferrer" target="_blank">
          GitHub private vulnerability reporting
        </a>
        . Include the affected endpoint or file, reproduction steps, and impact. You can expect an
        acknowledgement within 72 hours; please allow up to 30 days for a fix before public
        disclosure. Do not test against production with real customer data.
      </p>

      <h2>What Aegis touches — and what it doesn&apos;t</h2>
      <p>
        Aegis generates local blocklists. It never inspects your browsing, proxies your traffic, or
        uploads history. The attack surface is intentionally small: a static web app, five API
        routes, a signed Stripe webhook, and a Postgres schema with row-level security.
      </p>

      <h2>Controls in production</h2>
      <ul>
        <li>Payments are verified by Stripe webhook signatures; refunds and disputes revoke licenses automatically.</li>
        <li>Passwordless sign-in; every protected route validates the bearer token server-side.</li>
        <li>Row-level security on every table — payment, audit, and rate-limit tables accept no client access at all.</li>
        <li>Durable cross-instance rate limiting with hashed keys, so no raw IPs are stored.</li>
        <li>Strict input validation, generic error responses with request IDs, and logs that redact secrets and emails.</li>
        <li>CSP, HSTS, and frame-denial headers on every response; no production source maps.</li>
        <li>CI runs tests, dependency audits, and gitleaks secret scanning on every change.</li>
      </ul>

      <h2>The full policy</h2>
      <p>
        The complete policy, including scope and secrets-handling rules, lives in{' '}
        <a href={policyUrl} rel="noreferrer" target="_blank">
          SECURITY.md
        </a>{' '}
        in the public repository. A machine-readable contact is published at{' '}
        <code>/.well-known/security.txt</code> (RFC 9116).
      </p>
    </PageShell>
  )
}
