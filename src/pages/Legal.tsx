import { ShieldCheck } from 'lucide-react'
import { Link } from '../components/Link'

function LegalShell({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="legal-page">
      <header className="landing-header">
        <Link to="/" className="brand-lockup brand-link">
          <div className="brand-mark" aria-hidden="true">
            <ShieldCheck size={25} strokeWidth={2.25} />
          </div>
          <div>
            <p className="brand-name">Aegis AI Blocker</p>
            <p className="brand-subtitle">Legal</p>
          </div>
        </Link>
        <nav className="landing-nav" aria-label="Primary">
          <Link to="/app" className="secondary-button landing-nav-cta">
            Open dashboard
          </Link>
        </nav>
      </header>
      <article className="legal-body">
        <h1>{title}</h1>
        <p className="legal-updated">Last updated: {updated}</p>
        {children}
      </article>
    </div>
  )
}

export function Privacy() {
  return (
    <LegalShell title="Privacy Policy" updated="11 June 2026">
      <h2>The short version</h2>
      <p>
        Aegis sells blocklists. We collect the minimum needed to run accounts and licenses: your email
        address and your purchase record. We run no analytics scripts, no ads, and no tracking pixels,
        and your browsing activity never leaves your device.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account email.</strong> Used for magic-link sign-in and license lookup. Stored with our
          authentication provider, Supabase.
        </li>
        <li>
          <strong>License records.</strong> Which account purchased lifetime access, when, and through
          which provider (Stripe or the App Store).
        </li>
        <li>
          <strong>Payment events.</strong> Stripe processes all payments. We never see or store card
          numbers — we store only the event references Stripe sends to confirm or refund a purchase.
        </li>
      </ul>

      <h2>What we never collect</h2>
      <ul>
        <li>Your browsing history. Rules are generated and tested entirely in your browser.</li>
        <li>The websites your devices block. Blocking happens on your device or router, not our servers.</li>
        <li>Analytics, advertising, or fingerprinting data of any kind.</li>
      </ul>

      <h2>Where data lives</h2>
      <p>
        Account and license data is stored in Supabase (Postgres) with row-level security so each account
        can only read its own records. Payments are processed and stored by Stripe. Both providers
        encrypt data in transit and at rest.
      </p>

      <h2>Data retention and deletion</h2>
      <p>
        We keep license records for as long as your license is active so we can verify it. To delete your
        account and data, open a support request on{' '}
        <a href="https://github.com/Sebby1770/aegis-ai-blocker/issues" rel="noreferrer" target="_blank">
          GitHub
        </a>{' '}
        from the email tied to your account. Payment records required for tax and accounting are retained
        as the law requires.
      </p>

      <h2>Cookies and local storage</h2>
      <p>
        We use browser local storage for one purpose: keeping you signed in. No third-party cookies are
        set.
      </p>

      <h2>Changes</h2>
      <p>
        If this policy changes materially, the date above will be updated and the change will be noted in
        the public repository history.
      </p>
    </LegalShell>
  )
}

export function Terms() {
  return (
    <LegalShell title="Terms of Service" updated="11 June 2026">
      <h2>The agreement</h2>
      <p>
        These terms govern your use of Aegis AI Blocker (&ldquo;Aegis&rdquo;, &ldquo;we&rdquo;,
        &ldquo;us&rdquo;). By creating an account or purchasing a license you agree to them.
      </p>

      <h2>What you buy</h2>
      <p>
        A lifetime license is a one-time purchase that grants your account personal, non-transferable
        access to download the Aegis rule pack in all supported export formats, including future rule
        pack updates, for as long as the service operates.
      </p>

      <h2>What we promise — and what we don&apos;t</h2>
      <p>
        Aegis blocks the AI services in its curated rule pack and updates that pack over time. We do not
        and cannot promise that every AI service, present or future, will be blocked. New services,
        changed domains, embedded AI features, and first-party AI surfaces can appear faster than any
        blocklist updates.
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>Use the exports on devices and networks you own or are authorized to manage.</li>
        <li>Do not resell, redistribute, or republish the rule pack as your own product.</li>
        <li>Do not attempt to bypass license checks or abuse the API.</li>
      </ul>

      <h2>Refunds, revocation, and disputes</h2>
      <p>
        Refunds follow the <Link to="/refunds">refund policy</Link>. Refunded or disputed payments
        automatically deactivate the associated license. We may revoke licenses obtained through fraud or
        abuse.
      </p>

      <h2>Disclaimer and liability</h2>
      <p>
        The service is provided &ldquo;as is&rdquo; without warranties of any kind. To the maximum extent
        permitted by law, our total liability for any claim related to the service is limited to the
        amount you paid for your license.
      </p>

      <h2>Governing law</h2>
      <p>These terms are governed by the laws of Victoria, Australia.</p>

      <h2>Contact</h2>
      <p>
        Questions about these terms:{' '}
        <a href="https://github.com/Sebby1770/aegis-ai-blocker/issues" rel="noreferrer" target="_blank">
          open a support request
        </a>
        .
      </p>
    </LegalShell>
  )
}

export function Refunds() {
  return (
    <LegalShell title="Refund Policy" updated="11 June 2026">
      <h2>14-day refunds</h2>
      <p>
        If Aegis is not what you expected, request a refund within 14 days of purchase and we will refund
        the payment in full. No forms, no hoops.
      </p>

      <h2>How to request one</h2>
      <ol>
        <li>
          Open a request on{' '}
          <a href="https://github.com/Sebby1770/aegis-ai-blocker/issues" rel="noreferrer" target="_blank">
            GitHub
          </a>{' '}
          using the email address on your account, or reply to your Stripe receipt email.
        </li>
        <li>Include the approximate purchase date.</li>
        <li>Refunds are issued to the original payment method through Stripe, usually within 5–10 business days.</li>
      </ol>

      <h2>What happens to the license</h2>
      <p>
        When a refund is processed, the lifetime license deactivates automatically. Rule exports stop
        being available to the account immediately afterwards.
      </p>

      <h2>App Store purchases</h2>
      <p>
        Purchases made through Apple&apos;s App Store follow Apple&apos;s refund process and policies;
        request those refunds directly through Apple.
      </p>
    </LegalShell>
  )
}
