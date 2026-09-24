import type Stripe from 'stripe'

// Stamped by api/create-checkout-session.ts onto every session (and its
// payment intent). Only server code holding the Stripe secret key can set
// session metadata, so this marks a session as ours.
export const LIFETIME_PRODUCT = 'aegis_ai_blocker_lifetime'

export type FulfillmentDecision =
  | { fulfill: true; userId: string }
  | { fulfill: false; reason: 'wrong_product' | 'missing_user' | 'user_mismatch' | 'not_paid' | 'zero_amount' }

// Decides whether a checkout session may grant a lifetime license. Pure so it
// can be unit-tested.
//
// - Product binding: a signed webhook proves Stripe sent the event, not that
//   the session came from our checkout endpoint. Payment Links (and any other
//   integration on the same Stripe account) produce paid sessions too, and a
//   Payment Link takes `client_reference_id` straight from its URL — so the
//   user id must come from server-set metadata on a session stamped with our
//   product, never from client_reference_id alone.
// - Zero-value sessions are refused: a 100%-off promotion code (or a future
//   pricing misconfiguration) still reports payment_status 'paid' with
//   amount_total 0, and must not mint a free license unnoticed.
export function assessCheckoutSession(session: Stripe.Checkout.Session): FulfillmentDecision {
  if (session.mode !== 'payment' || session.metadata?.product !== LIFETIME_PRODUCT) {
    return { fulfill: false, reason: 'wrong_product' }
  }

  const userId = session.metadata?.user_id

  if (!userId) {
    return { fulfill: false, reason: 'missing_user' }
  }

  if (session.client_reference_id && session.client_reference_id !== userId) {
    return { fulfill: false, reason: 'user_mismatch' }
  }

  if (session.payment_status !== 'paid') {
    return { fulfill: false, reason: 'not_paid' }
  }

  if (typeof session.amount_total !== 'number' || session.amount_total <= 0) {
    return { fulfill: false, reason: 'zero_amount' }
  }

  return { fulfill: true, userId }
}

export type ChargeRevocation = { status: 'refunded' | 'revoked'; reason: string } | null

// Reads the money's current state at Stripe. Stripe does not guarantee event
// order and retries failed deliveries for days, so by the time a fulfilment
// event is processed the charge may already have been refunded or disputed —
// possibly with that refund/dispute event already processed (and a no-op,
// because there was no license yet to revoke). Mirrors the webhook's revoke
// rules: any refund revokes (charge.refunded fires for partial refunds too),
// any dispute revokes.
export function revocationFromCharge(
  charge: Pick<Stripe.Charge, 'refunded' | 'amount_refunded' | 'disputed'> | null | undefined,
): ChargeRevocation {
  if (!charge) {
    return null
  }

  if (charge.disputed) {
    return { status: 'revoked', reason: 'charge.dispute.created' }
  }

  if (charge.refunded || charge.amount_refunded > 0) {
    return { status: 'refunded', reason: 'charge.refunded' }
  }

  return null
}
