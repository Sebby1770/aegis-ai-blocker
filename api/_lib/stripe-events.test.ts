import { describe, expect, it } from 'vitest'
import type Stripe from 'stripe'
import { assessCheckoutSession, LIFETIME_PRODUCT, revocationFromCharge } from './stripe-events.js'

function session(overrides: Partial<Stripe.Checkout.Session> = {}) {
  return {
    id: 'cs_test_1',
    mode: 'payment',
    client_reference_id: 'user-1',
    metadata: { user_id: 'user-1', product: LIFETIME_PRODUCT },
    payment_status: 'paid',
    amount_total: 2900,
    currency: 'usd',
    ...overrides,
  } as Stripe.Checkout.Session
}

describe('assessCheckoutSession', () => {
  it('fulfills a paid, positive-amount session from our checkout', () => {
    expect(assessCheckoutSession(session())).toEqual({ fulfill: true, userId: 'user-1' })
  })

  it('accepts a session without client_reference_id when metadata carries the user', () => {
    const s = session({ client_reference_id: null })
    expect(assessCheckoutSession(s)).toEqual({ fulfill: true, userId: 'user-1' })
  })

  it('refuses sessions not stamped with our product (Payment Links, other integrations)', () => {
    expect(assessCheckoutSession(session({ metadata: {} }))).toEqual({ fulfill: false, reason: 'wrong_product' })
    expect(assessCheckoutSession(session({ metadata: { user_id: 'user-1', product: 'tip_jar' } }))).toEqual({
      fulfill: false,
      reason: 'wrong_product',
    })
    expect(assessCheckoutSession(session({ metadata: null }))).toEqual({ fulfill: false, reason: 'wrong_product' })
  })

  it('refuses subscription or setup sessions even with our metadata', () => {
    expect(assessCheckoutSession(session({ mode: 'subscription' }))).toEqual({ fulfill: false, reason: 'wrong_product' })
  })

  it('never takes the user id from client_reference_id alone', () => {
    const s = session({ client_reference_id: 'user-1', metadata: { product: LIFETIME_PRODUCT } })
    expect(assessCheckoutSession(s)).toEqual({ fulfill: false, reason: 'missing_user' })
  })

  it('refuses a session whose client_reference_id disagrees with the server-set user', () => {
    const s = session({ client_reference_id: 'user-2' })
    expect(assessCheckoutSession(s)).toEqual({ fulfill: false, reason: 'user_mismatch' })
  })

  it('refuses unpaid sessions (async payment still pending)', () => {
    const s = session({ payment_status: 'unpaid' })
    expect(assessCheckoutSession(s)).toEqual({ fulfill: false, reason: 'not_paid' })
  })

  it('refuses zero-amount sessions so a 100%-off promo cannot mint a license', () => {
    expect(assessCheckoutSession(session({ amount_total: 0 }))).toEqual({
      fulfill: false,
      reason: 'zero_amount',
    })
  })

  it('refuses sessions with missing or negative amounts', () => {
    expect(assessCheckoutSession(session({ amount_total: null }))).toEqual({
      fulfill: false,
      reason: 'zero_amount',
    })
    expect(assessCheckoutSession(session({ amount_total: -100 }))).toEqual({
      fulfill: false,
      reason: 'zero_amount',
    })
  })
})

describe('revocationFromCharge', () => {
  it('treats a clean charge (or no charge) as fulfilable', () => {
    expect(revocationFromCharge({ refunded: false, amount_refunded: 0, disputed: false })).toBeNull()
    expect(revocationFromCharge(null)).toBeNull()
  })

  it('maps full and partial refunds to refunded, matching the charge.refunded handler', () => {
    expect(revocationFromCharge({ refunded: true, amount_refunded: 2900, disputed: false })).toMatchObject({
      status: 'refunded',
    })
    expect(revocationFromCharge({ refunded: false, amount_refunded: 500, disputed: false })).toMatchObject({
      status: 'refunded',
    })
  })

  it('maps a dispute to revoked, even alongside a refund', () => {
    expect(revocationFromCharge({ refunded: true, amount_refunded: 2900, disputed: true })).toMatchObject({
      status: 'revoked',
    })
  })
})
