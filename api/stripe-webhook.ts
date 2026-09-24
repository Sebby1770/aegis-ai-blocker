import type Stripe from 'stripe'
import { requireEnv } from './_lib/env.js'
import { guardRequest, readRawBody, requestId, sendError } from './_lib/http.js'
import { logEvent } from './_lib/log.js'
import { assessCheckoutSession, revocationFromCharge } from './_lib/stripe-events.js'
import { supabaseAdmin, writeAuditLog } from './_lib/supabase.js'
import { stripeClient } from './_lib/stripe.js'
import type { ApiRequest, ApiResponse } from './_lib/types.js'

function paymentIntentId(value: string | Stripe.PaymentIntent | null | undefined) {
  if (!value) {
    return null
  }

  return typeof value === 'string' ? value : value.id
}

// Asks Stripe whether the payment behind a session has since been refunded or
// disputed (see revocationFromCharge for why the event stream alone can't be
// trusted to say so in order).
async function chargeRevocation(intentId: string | null) {
  if (!intentId) {
    return null
  }

  const intent = await stripeClient().paymentIntents.retrieve(intentId, { expand: ['latest_charge'] })
  const charge = typeof intent.latest_charge === 'object' ? intent.latest_charge : null
  return revocationFromCharge(charge)
}

async function fulfillCheckoutSession(session: Stripe.Checkout.Session) {
  const decision = assessCheckoutSession(session)

  if (!decision.fulfill) {
    if (decision.reason === 'wrong_product') {
      // Another product or integration on the same Stripe account (e.g. a
      // Payment Link): not ours to fulfil.
      logEvent('info', 'stripe_webhook_foreign_session_ignored', { session: session.id })
    }

    if (decision.reason === 'user_mismatch') {
      logEvent('warn', 'stripe_webhook_user_mismatch_rejected', { session: session.id })
      await writeAuditLog({
        actor: 'stripe_webhook',
        action: 'license.rejected_user_mismatch',
        subjectType: 'checkout_session',
        subjectId: session.id,
        userId: session.metadata?.user_id ?? null,
      })
    }

    // A zero-value "paid" session (100%-off promo code or price misconfig)
    // must never quietly become a lifetime license — record it for review.
    if (decision.reason === 'zero_amount') {
      logEvent('warn', 'stripe_webhook_zero_amount_rejected', { session: session.id })
      await writeAuditLog({
        actor: 'stripe_webhook',
        action: 'license.rejected_zero_amount',
        subjectType: 'checkout_session',
        subjectId: session.id,
        userId: session.client_reference_id ?? session.metadata?.user_id ?? null,
        metadata: {
          amount_total: session.amount_total ?? null,
          currency: session.currency ?? null,
        },
      })
    }
    return
  }

  const userId = decision.userId
  const admin = supabaseAdmin()
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null
  const intentId = paymentIntentId(session.payment_intent)

  const { error: profileError } = await admin.from('profiles').upsert(
    {
      id: userId,
      email: session.customer_details?.email ?? session.customer_email ?? null,
      stripe_customer_id: customerId,
    },
    { onConflict: 'id' },
  )

  if (profileError) {
    throw profileError
  }

  // If the money has already gone back (refund) or is contested (dispute),
  // record the license in that state instead of granting it.
  const revocation = await chargeRevocation(intentId)

  // Insert-once: a license row for a session is created exactly one time and
  // afterwards changes only through revocation. ignoreDuplicates (ON CONFLICT
  // DO NOTHING) means a retried or concurrent fulfilment can never flip a
  // refunded/revoked license back to 'active', and `.select()` returns only
  // rows actually inserted, so the activation is audited exactly once.
  const { data: inserted, error: licenseError } = await admin
    .from('lifetime_licenses')
    .upsert(
      {
        user_id: userId,
        provider: 'stripe',
        provider_reference: session.id,
        stripe_customer_id: customerId,
        payment_intent: intentId,
        status: revocation?.status ?? 'active',
        revoked_at: revocation ? new Date().toISOString() : null,
        purchased_at: new Date((session.created ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
      },
      { onConflict: 'provider,provider_reference', ignoreDuplicates: true },
    )
    .select('id')

  if (licenseError) {
    throw licenseError
  }

  if (!inserted || inserted.length === 0) {
    return
  }

  // Close the window between the Stripe check above and the insert: a refund
  // or dispute processed meanwhile found no license, but it left a durable
  // marker first. Having inserted, read the marker; whichever of the two ran
  // second sees the other.
  if (!revocation && intentId) {
    const { data: marker, error: markerError } = await admin
      .from('payment_revocations')
      .select('status,reason')
      .eq('payment_intent', intentId)
      .maybeSingle()

    if (markerError) {
      throw markerError
    }

    if (marker) {
      const { error: revokeError } = await admin
        .from('lifetime_licenses')
        .update({ status: marker.status, revoked_at: new Date().toISOString() })
        .eq('id', inserted[0].id)

      if (revokeError) {
        throw revokeError
      }

      logEvent('warn', 'stripe_webhook_fulfilled_after_revocation', { session: session.id, status: marker.status })
      await writeAuditLog({
        actor: 'stripe_webhook',
        action: `license.${marker.status}_before_fulfilment`,
        subjectType: 'lifetime_license',
        subjectId: session.id,
        userId,
        metadata: { reason: marker.reason },
      })
      return
    }
  }

  if (revocation) {
    logEvent('warn', 'stripe_webhook_fulfilled_after_revocation', { session: session.id, status: revocation.status })
  }

  await writeAuditLog({
    actor: 'stripe_webhook',
    action: revocation ? `license.${revocation.status}_before_fulfilment` : 'license.activated',
    subjectType: 'lifetime_license',
    subjectId: session.id,
    userId,
    metadata: {
      amount_total: session.amount_total ?? null,
      currency: session.currency ?? null,
      ...(revocation ? { reason: revocation.reason } : {}),
    },
  })
}

// Revokes the license tied to a payment intent. Newer licenses store the
// payment intent directly; for older rows we resolve the Checkout Session id
// from Stripe before matching on provider_reference.
async function revokeLicenseForPaymentIntent(
  intentId: string | null,
  nextStatus: 'refunded' | 'revoked',
  reason: string,
) {
  if (!intentId) {
    return
  }

  const admin = supabaseAdmin()
  const revokedAt = new Date().toISOString()

  // Record the revocation durably BEFORE looking for licenses, so a
  // fulfilment racing this event (or delivered after it) still honours it.
  const { error: markerError } = await admin
    .from('payment_revocations')
    .upsert({ payment_intent: intentId, status: nextStatus, reason }, { onConflict: 'payment_intent' })

  if (markerError) {
    throw markerError
  }

  const { data: byIntent, error: byIntentError } = await admin
    .from('lifetime_licenses')
    .update({ status: nextStatus, revoked_at: revokedAt })
    .eq('provider', 'stripe')
    .eq('payment_intent', intentId)
    .neq('status', nextStatus)
    .select('id,user_id')

  if (byIntentError) {
    throw byIntentError
  }

  let revoked = byIntent ?? []

  if (revoked.length === 0) {
    const sessions = await stripeClient().checkout.sessions.list({ payment_intent: intentId, limit: 1 })
    const sessionId = sessions.data[0]?.id

    if (sessionId) {
      const { data: bySession, error: bySessionError } = await admin
        .from('lifetime_licenses')
        .update({ status: nextStatus, revoked_at: revokedAt, payment_intent: intentId })
        .eq('provider', 'stripe')
        .eq('provider_reference', sessionId)
        .neq('status', nextStatus)
        .select('id,user_id')

      if (bySessionError) {
        throw bySessionError
      }

      revoked = bySession ?? []
    }
  }

  for (const license of revoked) {
    await writeAuditLog({
      actor: 'stripe_webhook',
      action: `license.${nextStatus}`,
      subjectType: 'lifetime_license',
      subjectId: license.id,
      userId: license.user_id,
      metadata: { reason },
    })
  }
}

async function processEvent(event: Stripe.Event) {
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      await fulfillCheckoutSession(event.data.object)
      return
    case 'charge.refunded': {
      const charge = event.data.object
      await revokeLicenseForPaymentIntent(paymentIntentId(charge.payment_intent), 'refunded', event.type)
      return
    }
    case 'charge.dispute.created': {
      const dispute = event.data.object
      await revokeLicenseForPaymentIntent(paymentIntentId(dispute.payment_intent), 'revoked', event.type)
      return
    }
    default:
      logEvent('info', 'stripe_webhook_ignored', { type: event.type })
  }
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  // Stripe calls server-to-server: no Origin header and no browser rate
  // limiting; the signature check below is the authentication gate.
  if (!(await guardRequest(req, res, { method: 'POST', enforceOrigin: false }))) {
    return
  }

  try {
    const signature = req.headers['stripe-signature']

    if (!signature || Array.isArray(signature)) {
      return sendError(res, 400, 'missing_signature')
    }

    const rawBody = await readRawBody(req)
    const event = stripeClient().webhooks.constructEvent(rawBody, signature, requireEnv('STRIPE_WEBHOOK_SECRET'))
    const admin = supabaseAdmin()
    const { data: existingEvent, error: eventLookupError } = await admin
      .from('payment_events')
      .select('event_id')
      .eq('event_id', event.id)
      .maybeSingle()

    if (eventLookupError) {
      throw eventLookupError
    }

    if (existingEvent) {
      return res.status(200).json({ received: true, duplicate: true })
    }

    await processEvent(event)

    const { error: insertEventError } = await admin
      .from('payment_events')
      .upsert(
        {
          event_id: event.id,
          event_type: event.type,
          processed_at: new Date().toISOString(),
        },
        { onConflict: 'event_id', ignoreDuplicates: true },
      )

    if (insertEventError) {
      throw insertEventError
    }

    logEvent('info', 'stripe_webhook_processed', { type: event.type, requestId: requestId(res) })
    return res.status(200).json({ received: true })
  } catch {
    logEvent('error', 'stripe_webhook_failed', { requestId: requestId(res) })
    return sendError(res, 400, 'webhook_failed')
  }
}
