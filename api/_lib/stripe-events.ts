import type Stripe from 'stripe'

export type FulfillmentDecision =
  | { fulfill: true; userId: string }
  | { fulfill: false; reason: 'missing_user' | 'not_paid' | 'zero_amount' }

// Decides whether a checkout session may grant a lifetime license. Pure so it
// can be unit-tested. Beyond the original user/paid checks, it refuses
// zero-value sessions: a signed webhook proves Stripe sent the event, not that
// money changed hands — a 100%-off promotion code (or a future pricing
// misconfiguration) still reports payment_status 'paid' with amount_total 0,
// and must not mint a free license unnoticed.
export function assessCheckoutSession(session: Stripe.Checkout.Session): FulfillmentDecision {
  const userId = session.client_reference_id ?? session.metadata?.user_id

  if (!userId) {
    return { fulfill: false, reason: 'missing_user' }
  }

  if (session.payment_status !== 'paid') {
    return { fulfill: false, reason: 'not_paid' }
  }

  if (typeof session.amount_total !== 'number' || session.amount_total <= 0) {
    return { fulfill: false, reason: 'zero_amount' }
  }

  return { fulfill: true, userId }
}
