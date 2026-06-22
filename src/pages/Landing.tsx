import { useMemo, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Ban,
  CheckCircle2,
  Download,
  KeyRound,
} from "lucide-react";
import { isDomainBlocked, rulePack } from "../lib/blocklists";
import {
  defaultDomainCount,
  defaultDomains,
  serviceCount,
  strictDomainCount,
} from "../lib/marketing";
import { priceDisplay, useSaas } from "../lib/saas-context";
import { HeroField } from "../components/HeroField";
import { Link } from "../components/Link";
import { MarketingHeader } from "../components/MarketingHeader";
import { navigate } from "../router";

function LiveDomainCheck() {
  const [value, setValue] = useState("chatgpt.com");
  const result = useMemo(() => isDomainBlocked(value, defaultDomains), [value]);
  const hasInput = value.trim().length > 0;

  return (
    <div className="landing-tester">
      <label className="tester-input">
        <span>Try it now — paste any AI site or API</span>
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="chatgpt.com"
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      {hasInput && (
        <div className={`test-result ${result.blocked ? "allowed" : "blocked"}`}>
          {result.blocked ? <CheckCircle2 size={18} /> : <Ban size={18} />}
          <span>
            {result.blocked
              ? `Covered — blocked by the ${result.matchedDomain} rule`
              : "Not in the default pack — try strict mode in the dashboard, or request it"}
          </span>
        </div>
      )}
      <p className="landing-tester-note">
        Checked against the default rule pack, live in your browser. Nothing you
        type is sent anywhere.
      </p>
    </div>
  );
}

export function Landing() {
  const { licensed, checkoutLoading, session, startCheckout } = useSaas();

  const buyNow = () => {
    if (!session || licensed) {
      navigate("/app");
      return;
    }

    void startCheckout();
  };

  return (
    <div className="landing">
      <MarketingHeader />

      <section className="hero">
        <span className="hero-orb hero-orb-1" aria-hidden="true" />
        <HeroField />

        <div className="hero-inner">
          <p className="hero-eyebrow">
            <BadgeCheck size={16} />
            Intentional digital boundaries · one payment · no tracking
          </p>
          <h1>
            Decide where <span className="grad-text">AI</span> is allowed in your
            life
          </h1>
          <p className="hero-copy">
            Aegis is a policy engine for AI exposure. Choose a value — Focus,
            Child-safe, School exam, Workplace — and Aegis turns it into
            ready-to-use rules for your phone, your browser, and your whole home
            network.
          </p>
          <div className="hero-actions">
            <button
              className="primary-button hero-cta"
              type="button"
              onClick={buyNow}
            >
              {licensed ? <Download size={18} /> : <KeyRound size={18} />}
              {licensed
                ? "Open your dashboard"
                : checkoutLoading
                  ? "Starting…"
                  : `Get lifetime access · ${priceDisplay}`}
            </button>
            <Link to="/philosophy" className="secondary-button hero-secondary">
              Why Aegis exists
              <ArrowRight size={16} />
            </Link>
          </div>

          <div className="mode-strip" aria-label="Policy modes">
            {rulePack.policies.slice(0, 6).map((policy) => (
              <Link key={policy.id} to="/app/protection" className="mode-pill">
                {policy.name}
              </Link>
            ))}
          </div>

          <LiveDomainCheck />

          <div className="hero-stats" aria-label="Coverage statistics">
            <div>
              <strong>{defaultDomainCount}</strong>
              <span>domains blocked by default</span>
            </div>
            <div>
              <strong>{strictDomainCount}</strong>
              <span>domains in strict mode</span>
            </div>
            <div>
              <strong>{serviceCount}</strong>
              <span>AI services tracked</span>
            </div>
            <div>
              <strong>5</strong>
              <span>export formats</span>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section" id="how-it-works" data-reveal>
        <p className="eyebrow">How it works</p>
        <h2>Protected in three steps</h2>
        <div className="steps-grid">
          <article className="step-card">
            <span className="step-number">1</span>
            <KeyRound size={22} />
            <h3>Sign in with your email</h3>
            <p>No passwords to remember — a magic link signs you in securely.</p>
          </article>
          <article className="step-card">
            <span className="step-number">2</span>
            <BadgeCheck size={22} />
            <h3>Pay once with Stripe</h3>
            <p>
              One-time payment, processed by Stripe. Your license activates
              automatically.
            </p>
          </article>
          <article className="step-card">
            <span className="step-number">3</span>
            <Download size={22} />
            <h3>Download rules for your device</h3>
            <p>
              Pick iPhone, computer, or router and import the file into your
              blocker of choice.
            </p>
          </article>
        </div>
      </section>

      <section className="landing-section" id="philosophy" data-reveal>
        <p className="eyebrow">The idea</p>
        <h2>Not &ldquo;AI bad.&rdquo; AI on your terms.</h2>
        <div className="belief-grid">
          <p>
            <strong>I</strong> choose when AI enters my attention.
          </p>
          <p>
            <strong>Families</strong> choose what tools their kids can reach.
          </p>
          <p>
            <strong>Schools</strong> choose what counts as fair assistance.
          </p>
          <p>
            <strong>Workers</strong> choose focus over ambient automation.
          </p>
        </div>
        <Link to="/philosophy" className="secondary-button belief-cta">
          Read the philosophy
          <ArrowRight size={16} />
        </Link>
      </section>

      <section className="cta-band" data-reveal>
        <div>
          <h2>Every rule, in the open</h2>
          <p>
            {serviceCount} services, each with a last-verified date and a
            breakage-risk label. No black box — see exactly what Aegis blocks and
            why.
          </p>
        </div>
        <div className="cta-band-actions">
          <Link to="/catalog" className="secondary-button">
            Browse the catalog
          </Link>
          <Link to="/pricing" className="primary-button">
            See pricing
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </div>
  );
}
