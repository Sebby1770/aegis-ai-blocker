import { Link } from '../components/Link'
import { PageShell } from '../components/PageShell'

function LegalShell({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <PageShell title={title} intro={`Last updated: ${updated}`}>
      {children}
    </PageShell>
  )
}

export function Privacy() {
  return (
    <LegalShell title="Privacy Policy" updated="12 July 2026">
      <h2>Who runs Aegis</h2>
      <p>
        Aegis AI Blocker is operated by Sebastian Forbes, a sole trader based in Australia, who is the
        data controller for the information described in this policy. For any privacy request, email{' '}
        <a href="mailto:sebforbes03@gmail.com">sebforbes03@gmail.com</a>.
      </p>

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

      <h2>Your rights and choices</h2>
      <p>
        You can ask us to access, correct, export, or delete your personal data, and you can object to or
        restrict how we use it. To exercise any of these, email{' '}
        <a href="mailto:sebforbes03@gmail.com">sebforbes03@gmail.com</a> from the address tied to your
        account. If you are in the EU, UK, or a US state with privacy legislation, you also have the right
        to lodge a complaint with your local data-protection authority.
      </p>

      <h2>Data retention and deletion</h2>
      <p>
        We keep license records for as long as your license is active so we can verify it. To delete your
        account and data, email{' '}
        <a href="mailto:sebforbes03@gmail.com">sebforbes03@gmail.com</a> from the email address tied to
        your account; we action deletion requests within 30 days. We never ask you to send deletion or
        other privacy requests through any public channel. Payment records required for tax and accounting
        are retained as the law requires.
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
    <LegalShell title="Terms of Service" updated="12 July 2026">
      <h2>The agreement</h2>
      <p>
        Aegis AI Blocker (&ldquo;Aegis&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) is operated by
        Sebastian Forbes, a sole trader based in Australia, who is the party you contract with under these
        terms. By creating an account or purchasing a license you agree to them. You can reach us any time
        at <a href="mailto:sebforbes03@gmail.com">sebforbes03@gmail.com</a>.
      </p>

      <h2>What you buy</h2>
      <p>
        A lifetime license is a one-time purchase that grants your account personal, non-transferable
        access to download the Aegis rule pack in all supported export formats, including future rule pack
        updates, for the operating life of the service. &ldquo;Lifetime&rdquo; means the lifetime of the
        product, not a guaranteed number of years: there is no recurring fee and no renewal — it does not
        promise the service will run forever.
      </p>
      <p>
        If we ever have to discontinue Aegis, we will give at least 30 days&apos; notice on this site and,
        where we can, by email, and we will keep the rule pack you paid for available to download during
        that period. Any exports you have already downloaded remain yours to keep and use.
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

      <h2>Your consumer rights</h2>
      <p>
        Nothing in these terms excludes, restricts, or modifies any guarantee, right, or remedy you have
        under the Australian Consumer Law or any other law that cannot legally be excluded. If you are a
        consumer in the EU or UK, you keep your statutory rights, including the legal guarantee that
        digital content matches its description and works as described. Where such rights apply they
        operate alongside these terms and prevail to the extent of any conflict.
      </p>

      <h2>Disclaimer and liability</h2>
      <p>
        Except for the rights described above that cannot be excluded, and to the maximum extent permitted
        by law: the service is provided &ldquo;as is&rdquo; without warranties of any kind, and our total
        liability for any claim related to the service is limited to the amount you paid for your license.
      </p>

      <h2>Governing law</h2>
      <p>
        These terms are governed by the laws of Victoria, Australia. This does not deprive you of the
        protection of any mandatory consumer law of the country where you live.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms? Email{' '}
        <a href="mailto:sebforbes03@gmail.com">sebforbes03@gmail.com</a>.
      </p>
    </LegalShell>
  )
}

export function Refunds() {
  return (
    <LegalShell title="Refund Policy" updated="12 July 2026">
      <h2>14-day refunds</h2>
      <p>
        If Aegis is not what you expected, request a refund within 14 days of purchase and we will refund
        the payment in full. No forms, no hoops. This voluntary policy is in addition to — and never
        instead of — any refund or withdrawal right you have under consumer law where you live.
      </p>

      <h2>How to request one</h2>
      <ol>
        <li>
          Email <a href="mailto:sebforbes03@gmail.com">sebforbes03@gmail.com</a> from the email address on
          your account, or reply to your Stripe receipt email.
        </li>
        <li>Include the approximate purchase date.</li>
        <li>Refunds are issued to the original payment method through Stripe, usually within 5–10 business days.</li>
      </ol>

      <h2>EU &amp; UK withdrawal rights</h2>
      <p>
        If you are a consumer in the EU or UK, you have a statutory right to withdraw from a distance
        purchase of digital content within 14 days without giving a reason. Because Aegis delivers its
        digital content immediately, at checkout you request immediate performance and acknowledge that
        the statutory withdrawal right ends once you access or download the rule pack. To withdraw before
        then, email <a href="mailto:sebforbes03@gmail.com">sebforbes03@gmail.com</a> with a clear
        statement that you withdraw from the purchase (a model form is not required).
      </p>
      <p>
        Either way you are not left worse off: our voluntary 14-day refund above applies even after you
        have downloaded the rules, and nothing in this policy limits any non-excludable consumer
        guarantee, including under the Australian Consumer Law.
      </p>

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
