import type Stripe from 'stripe'
import { requireEnv } from './_lib/env.js'
import { readRawBody, requireMethod, sendError, setSecurityHeaders } from './_lib/http.js'
import { supabaseAdmin } from './_lib/supabase.js'
import { stripeClient } from './_lib/stripe.js'
import type { ApiRequest, ApiResponse } from './_lib/types.js'

async function fulfillCheckoutSession(session: Stripe.Checkout.Session) {
  const userId = session.client_reference_id ?? session.metadata?.user_id

  if (!userId || session.payment_status !== 'paid') {
    return
  }

  const admin = supabaseAdmin()
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null

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
      status: 'active',
      purchased_at: new Date((session.created ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
    },
    { onConflict: 'provider,provider_reference' },
  )

  if (licenseError) {
    throw licenseError
  }
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setSecurityHeaders(res)

  if (!requireMethod(req, res, 'POST')) {
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

    if (event.type === 'checkout.session.completed') {
      await fulfillCheckoutSession(event.data.object)
    }

    const { error: insertEventError } = await admin.from('payment_events').insert({
      event_id: event.id,
      event_type: event.type,
      processed_at: new Date().toISOString(),
    })

    if (insertEventError) {
      throw insertEventError
    }

    return res.status(200).json({ received: true })
  } catch {
    console.error('stripe_webhook_failed')
    return sendError(res, 400, 'webhook_failed')
  }
}
