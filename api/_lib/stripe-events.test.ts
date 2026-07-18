import { describe, expect, it } from 'vitest'
import type Stripe from 'stripe'
import { assessCheckoutSession } from './stripe-events.js'

function session(overrides: Partial<Stripe.Checkout.Session> = {}) {
  return {
    id: 'cs_test_1',
    client_reference_id: 'user-1',
    metadata: {},
    payment_status: 'paid',
    amount_total: 2900,
    currency: 'usd',
    ...overrides,
  } as Stripe.Checkout.Session
}

describe('assessCheckoutSession', () => {
  it('fulfills a paid, positive-amount session', () => {
    expect(assessCheckoutSession(session())).toEqual({ fulfill: true, userId: 'user-1' })
  })

  it('falls back to metadata.user_id when client_reference_id is absent', () => {
    const s = session({ client_reference_id: null, metadata: { user_id: 'user-2' } })
    expect(assessCheckoutSession(s)).toEqual({ fulfill: true, userId: 'user-2' })
  })

  it('refuses sessions with no user attribution', () => {
    const s = session({ client_reference_id: null, metadata: {} })
    expect(assessCheckoutSession(s)).toEqual({ fulfill: false, reason: 'missing_user' })
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
