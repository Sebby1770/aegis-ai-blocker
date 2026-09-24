import { beforeEach, describe, expect, it, vi } from 'vitest'
import handler from '../stripe-webhook.js'
import {
  auditActions,
  dispute,
  invoke,
  licensesFor,
  mockRequest,
  paidSession,
  refundedCharge,
  resetState,
  SERVICE_KEY_CANARY,
  signedWebhookRequest,
  state,
  stripeEvent,
  USER_A,
  USER_B,
} from './harness.js'

vi.mock('@supabase/supabase-js', async () => (await import('./harness.js')).supabaseModule)
vi.mock('../_lib/stripe.js', async () => (await import('./harness.js')).stripeModule)

beforeEach(() => {
  resetState()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

function deliver(event: object, options?: Parameters<typeof signedWebhookRequest>[1]) {
  return invoke(handler, signedWebhookRequest(event, options))
}

describe('signature verification', () => {
  it('rejects a request with no Stripe-Signature header and writes nothing', async () => {
    const event = stripeEvent('checkout.session.completed', paidSession())
    const res = await invoke(handler, mockRequest({ method: 'POST', body: JSON.stringify(event) }))

    expect(res.statusCode).toBe(400)
    expect(state.db.rows('lifetime_licenses')).toHaveLength(0)
    expect(state.db.rows('payment_events')).toHaveLength(0)
  })

  it('rejects an event signed with the wrong secret', async () => {
    const res = await deliver(stripeEvent('checkout.session.completed', paidSession()), {
      secret: 'whsec_attacker_guess',
    })

    expect(res.statusCode).toBe(400)
    expect(licensesFor(USER_A)).toHaveLength(0)
  })

  it('rejects a body altered after signing (verification is over the raw bytes)', async () => {
    const genuine = stripeEvent('checkout.session.completed', paidSession({ amount_total: 0 }))
    const forged = stripeEvent('checkout.session.completed', paidSession(), genuine.id)
    const res = await deliver(genuine, { body: JSON.stringify(forged) })

    expect(res.statusCode).toBe(400)
    expect(licensesFor(USER_A)).toHaveLength(0)
  })

  it('rejects a correctly signed event replayed outside the 5-minute tolerance', async () => {
    const tenMinutesAgo = Math.floor(Date.now() / 1000) - 600
    const res = await deliver(stripeEvent('checkout.session.completed', paidSession()), { timestamp: tenMinutesAgo })

    expect(res.statusCode).toBe(400)
    expect(licensesFor(USER_A)).toHaveLength(0)
  })

  it('never echoes internal error details, even when a dependency error contains secrets', async () => {
    state.db.failOnce('payment_events', 'select', `connection failed using key ${SERVICE_KEY_CANARY}`)
    const res = await deliver(stripeEvent('checkout.session.completed', paidSession()))

    expect(res.statusCode).toBe(400)
    expect(Object.keys(res.body as object).sort()).toEqual(['error', 'requestId'])
    expect(res.text).not.toContain(SERVICE_KEY_CANARY)
    expect(res.text).not.toContain('connection failed')
  })
})

describe('fulfilment', () => {
  it('grants exactly one active license for a paid session and records the event', async () => {
    const event = stripeEvent('checkout.session.completed', paidSession())
    const res = await deliver(event)

    expect(res.statusCode).toBe(200)
    expect(licensesFor(USER_A)).toMatchObject([
      { status: 'active', provider: 'stripe', provider_reference: 'cs_test_paid_1', payment_intent: 'pi_test_1' },
    ])
    expect(auditActions()).toEqual(['license.activated'])
    expect(state.db.rows('payment_events').map((row) => row.event_id)).toEqual([event.id])
  })

  it('processes a replayed event ID once: no second license, reported as duplicate', async () => {
    const event = stripeEvent('checkout.session.completed', paidSession())
    await deliver(event)
    const replay = await deliver(event)

    expect(replay.statusCode).toBe(200)
    expect(replay.body).toMatchObject({ duplicate: true })
    expect(licensesFor(USER_A)).toHaveLength(1)
    expect(auditActions()).toEqual(['license.activated'])
  })

  it('handles the same event delivered concurrently: one license, one activation record', async () => {
    const event = stripeEvent('checkout.session.completed', paidSession())
    const responses = await Promise.all([deliver(event), deliver(event)])

    expect(responses.map((res) => res.statusCode)).toEqual([200, 200])
    expect(licensesFor(USER_A)).toHaveLength(1)
    expect(auditActions().filter((action) => action === 'license.activated')).toHaveLength(1)
  })

  it('does not fulfil a session whose async payment is still pending, then fulfils on success', async () => {
    const pending = paidSession({ payment_status: 'unpaid' })
    await deliver(stripeEvent('checkout.session.completed', pending))
    expect(licensesFor(USER_A)).toHaveLength(0)

    await deliver(stripeEvent('checkout.session.async_payment_succeeded', paidSession()))
    expect(licensesFor(USER_A)).toMatchObject([{ status: 'active' }])
  })

  it('ignores async payment failures', async () => {
    await deliver(stripeEvent('checkout.session.async_payment_failed', paidSession({ payment_status: 'unpaid' })))
    expect(licensesFor(USER_A)).toHaveLength(0)
  })

  it('refuses a zero-amount "paid" session (100%-off promotion code) and audits it', async () => {
    await deliver(stripeEvent('checkout.session.completed', paidSession({ amount_total: 0 })))

    expect(licensesFor(USER_A)).toHaveLength(0)
    expect(auditActions()).toEqual(['license.rejected_zero_amount'])
  })

  // FINDING: fulfilment trusted any paid session carrying a user id. Payment
  // Links accept `?client_reference_id=` straight from the URL, so a cheap
  // Payment Link for any other product in the same Stripe account minted a
  // lifetime license for whichever user id the buyer typed in.
  it('only fulfils sessions created by our checkout endpoint for the lifetime product', async () => {
    const paymentLinkPurchase = paidSession({
      id: 'cs_test_payment_link',
      amount_total: 100,
      client_reference_id: USER_B,
      payment_link: 'plink_tip_jar',
      metadata: {},
    })
    const res = await deliver(stripeEvent('checkout.session.completed', paymentLinkPurchase))

    expect(res.statusCode).toBe(200)
    expect(licensesFor(USER_B)).toHaveLength(0)
  })

  it('refuses a session whose user attribution disagrees with the server-set metadata', async () => {
    const tampered = paidSession({ client_reference_id: USER_B, metadata: { user_id: USER_A, product: 'aegis_ai_blocker_lifetime' } })
    await deliver(stripeEvent('checkout.session.completed', tampered))

    expect(licensesFor(USER_A)).toHaveLength(0)
    expect(licensesFor(USER_B)).toHaveLength(0)
  })

  it('still fulfils the synthetic event scripts/verify-buy-flow.mjs sends (no payment intent)', async () => {
    const synthetic = {
      id: 'cs_test_verify_1',
      object: 'checkout.session',
      mode: 'payment',
      client_reference_id: USER_A,
      metadata: { user_id: USER_A, product: 'aegis_ai_blocker_lifetime' },
      payment_status: 'paid',
      payment_intent: null,
      customer: null,
      customer_email: 'verify@example.com',
      customer_details: { email: 'verify@example.com' },
      amount_total: 2900,
      currency: 'usd',
      created: Math.floor(Date.now() / 1000),
    }
    const res = await deliver(stripeEvent('checkout.session.completed', synthetic))

    expect(res.statusCode).toBe(200)
    expect(licensesFor(USER_A)).toMatchObject([{ status: 'active' }])
    expect(state.stripe.paymentIntents.retrieve).not.toHaveBeenCalled()
  })

  it('records unknown event types without acting on them', async () => {
    const event = stripeEvent('customer.created', { id: 'cus_1', object: 'customer' })
    const res = await deliver(event)

    expect(res.statusCode).toBe(200)
    expect(state.db.rows('payment_events').map((row) => row.event_type)).toEqual(['customer.created'])
    expect(state.db.rows('lifetime_licenses')).toHaveLength(0)
  })
})

describe('refunds and disputes', () => {
  it('a refund revokes the license (status refunded, revoked_at set, audited)', async () => {
    await deliver(stripeEvent('checkout.session.completed', paidSession()))
    await deliver(stripeEvent('charge.refunded', refundedCharge()))

    expect(licensesFor(USER_A)).toMatchObject([{ status: 'refunded' }])
    expect(licensesFor(USER_A)[0].revoked_at).toEqual(expect.any(String))
    expect(auditActions()).toEqual(['license.activated', 'license.refunded'])
  })

  it('a dispute revokes the license', async () => {
    await deliver(stripeEvent('checkout.session.completed', paidSession()))
    await deliver(stripeEvent('charge.dispute.created', dispute()))

    expect(licensesFor(USER_A)).toMatchObject([{ status: 'revoked' }])
  })

  it('a refund only touches the license bought with that payment', async () => {
    await deliver(stripeEvent('checkout.session.completed', paidSession()))
    await deliver(
      stripeEvent(
        'checkout.session.completed',
        paidSession({
          id: 'cs_test_paid_b',
          payment_intent: 'pi_test_b',
          client_reference_id: USER_B,
          metadata: { user_id: USER_B, product: 'aegis_ai_blocker_lifetime' },
        }),
      ),
    )
    await deliver(stripeEvent('charge.refunded', refundedCharge('pi_test_b')))

    expect(licensesFor(USER_A)).toMatchObject([{ status: 'active' }])
    expect(licensesFor(USER_B)).toMatchObject([{ status: 'refunded' }])
  })

  // FINDING: Stripe does not guarantee event order, and retries a failed
  // delivery for up to three days. When the refund (or dispute) is processed
  // before the fulfilment — e.g. fulfilment failed during a database blip, the
  // customer complained and was refunded, then Stripe's retry succeeded — the
  // revocation found nothing to revoke and the late fulfilment granted an
  // active license for money that had already been returned.
  it('a refund processed before fulfilment still wins', async () => {
    state.stripe.checkout.sessions.list.mockResolvedValue({ data: [{ id: 'cs_test_paid_1' }] })
    state.stripe.paymentIntents.retrieve.mockResolvedValue({
      id: 'pi_test_1',
      object: 'payment_intent',
      latest_charge: { id: 'ch_test_1', object: 'charge', refunded: true, amount_refunded: 2900, disputed: false },
    })

    await deliver(stripeEvent('charge.refunded', refundedCharge()))
    await deliver(stripeEvent('checkout.session.completed', paidSession()))

    expect(licensesFor(USER_A).filter((row) => row.status === 'active')).toHaveLength(0)
  })

  it('a dispute processed before fulfilment still wins', async () => {
    state.stripe.paymentIntents.retrieve.mockResolvedValue({
      id: 'pi_test_1',
      object: 'payment_intent',
      latest_charge: { id: 'ch_test_1', object: 'charge', refunded: false, amount_refunded: 0, disputed: true },
    })

    await deliver(stripeEvent('charge.dispute.created', dispute()))
    await deliver(stripeEvent('checkout.session.completed', paidSession()))

    expect(licensesFor(USER_A).filter((row) => row.status === 'active')).toHaveLength(0)
  })

  // FINDING (residual race from the Stripe-state check): fulfilment asked
  // Stripe, saw a clean charge, and a refund processed in that window found
  // no license to revoke — so the license was inserted active afterwards.
  it('a refund processed while fulfilment is mid-flight still wins', async () => {
    state.stripe.checkout.sessions.list.mockResolvedValue({ data: [{ id: 'cs_test_paid_1' }] })
    state.stripe.paymentIntents.retrieve.mockImplementationOnce(async (id: string) => {
      // The refund lands between fulfilment's Stripe check and its insert.
      await deliver(stripeEvent('charge.refunded', refundedCharge()))
      return {
        id,
        object: 'payment_intent',
        latest_charge: { id: 'ch_test_1', object: 'charge', refunded: false, amount_refunded: 0, disputed: false },
      }
    })

    await deliver(stripeEvent('checkout.session.completed', paidSession()))

    expect(licensesFor(USER_A)).toMatchObject([{ status: 'refunded' }])
  })

  it('a dispute processed while fulfilment is mid-flight still wins', async () => {
    state.stripe.paymentIntents.retrieve.mockImplementationOnce(async (id: string) => {
      await deliver(stripeEvent('charge.dispute.created', dispute()))
      return {
        id,
        object: 'payment_intent',
        latest_charge: { id: 'ch_test_1', object: 'charge', refunded: false, amount_refunded: 0, disputed: false },
      }
    })

    await deliver(stripeEvent('checkout.session.completed', paidSession()))

    expect(licensesFor(USER_A)).toMatchObject([{ status: 'revoked' }])
  })

  // FINDING: the fulfilment upsert wrote status 'active' unconditionally, so a
  // Stripe retry of a fulfilment event whose first attempt had partly
  // succeeded (license written, event ledger write failed) re-activated a
  // license that a refund had revoked in between.
  it('a retried fulfilment never re-activates a revoked license', async () => {
    const fulfilment = stripeEvent('checkout.session.completed', paidSession())

    state.db.failOnce('payment_events', 'upsert', 'transient outage')
    const firstAttempt = await deliver(fulfilment)
    expect(firstAttempt.statusCode).toBe(400) // Stripe will retry this event
    expect(licensesFor(USER_A)).toMatchObject([{ status: 'active' }])

    await deliver(stripeEvent('charge.refunded', refundedCharge()))
    expect(licensesFor(USER_A)).toMatchObject([{ status: 'refunded' }])

    // Stripe's retry: from here on the charge is refunded at Stripe too.
    state.stripe.paymentIntents.retrieve.mockResolvedValue({
      id: 'pi_test_1',
      object: 'payment_intent',
      latest_charge: { id: 'ch_test_1', object: 'charge', refunded: true, amount_refunded: 2900, disputed: false },
    })
    const retry = await deliver(fulfilment)

    expect(retry.statusCode).toBe(200)
    expect(licensesFor(USER_A)).toMatchObject([{ status: 'refunded' }])
  })
})
