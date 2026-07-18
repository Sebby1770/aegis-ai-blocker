import type Stripe from 'stripe'
import { requireEnv } from './_lib/env.js'
import { guardRequest, readRawBody, requestId, sendError } from './_lib/http.js'
import { logEvent } from './_lib/log.js'
import { assessCheckoutSession } from './_lib/stripe-events.js'
import { supabaseAdmin, writeAuditLog } from './_lib/supabase.js'
import { stripeClient } from './_lib/stripe.js'
import type { ApiRequest, ApiResponse } from './_lib/types.js'

function paymentIntentId(value: string | Stripe.PaymentIntent | null | undefined) {
  if (!value) {
    return null
  }

  return typeof value === 'string' ? value : value.id
}

async function fulfillCheckoutSession(session: Stripe.Checkout.Session) {
  const decision = assessCheckoutSession(session)

  if (!decision.fulfill) {
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

  const { error: licenseError } = await admin.from('lifetime_licenses').upsert(
    {
      user_id: userId,
      provider: 'stripe',
      provider_reference: session.id,
      stripe_customer_id: customerId,
      payment_intent: intentId,
      status: 'active',
      purchased_at: new Date((session.created ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
    },
    { onConflict: 'provider,provider_reference' },
  )

  if (licenseError) {
    throw licenseError
  }

  await writeAuditLog({
    actor: 'stripe_webhook',
    action: 'license.activated',
    subjectType: 'lifetime_license',
    subjectId: session.id,
    userId,
    metadata: {
      amount_total: session.amount_total ?? null,
      currency: session.currency ?? null,
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
