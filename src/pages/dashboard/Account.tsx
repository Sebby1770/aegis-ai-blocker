import { CheckCircle2, KeyRound, LifeBuoy, ReceiptText, ScrollText } from 'lucide-react'
import { Link } from '../../components/Link'
import { MagicLinkForm } from '../../components/MagicLinkForm'
import { useSaas } from '../../lib/saas-context'

export function Account() {
  const { configured, session, userEmail, licensed, checkoutLoading, startCheckout, refreshEntitlement, signOut } =
    useSaas()

  return (
    <>
      <header className="topbar">
        <div>
          <h1>Your account</h1>
          <p className="topbar-copy">Sign-in, license, and billing — all tied to one email address.</p>
        </div>
      </header>

      <section className="content-grid account-grid">
        <section className="panel" aria-label="Account">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Account</p>
              <h2>{session ? 'Signed in' : 'Sign in'}</h2>
            </div>
            <KeyRound size={20} />
          </div>

          {!configured ? (
            <p className="muted-copy">Paid accounts are not connected in this local preview yet.</p>
          ) : session ? (
            <div className="account-stack">
              <p className="signed-in-copy">Signed in as {userEmail}</p>
              <div className={`license-badge ${licensed ? 'active' : ''}`}>
                {licensed ? 'Lifetime license active' : 'No active license'}
              </div>
              <div className="button-row">
                {licensed ? (
                  <button className="secondary-button" type="button" onClick={() => void refreshEntitlement()}>
                    Refresh license
                  </button>
                ) : (
                  <button className="primary-button" type="button" onClick={() => void startCheckout()}>
                    {checkoutLoading ? 'Starting…' : 'Buy lifetime access'}
                  </button>
                )}
                <button className="secondary-button" type="button" onClick={() => void signOut()}>
                  Sign out
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="muted-copy">
                We email you a one-time sign-in link — no password to remember or leak.
              </p>
              <MagicLinkForm />
            </>
          )}
        </section>

        <section className="panel" aria-label="Help">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Help</p>
              <h2>Need a hand?</h2>
            </div>
            <CheckCircle2 size={20} />
          </div>

          <div className="help-links">
            <Link to="/support" className="help-link">
              <LifeBuoy size={18} />
              <span>
                <strong>Support</strong>
                <small>Quick fixes, contact, and service requests</small>
              </span>
            </Link>
            <Link to="/refunds" className="help-link">
              <ReceiptText size={18} />
              <span>
                <strong>Refund policy</strong>
                <small>14 days, no hoops — refunds deactivate the license</small>
              </span>
            </Link>
            <Link to="/changelog" className="help-link">
              <ScrollText size={18} />
              <span>
                <strong>Changelog</strong>
                <small>What changed in the latest rule pack</small>
              </span>
            </Link>
          </div>
        </section>
      </section>
    </>
  )
}
