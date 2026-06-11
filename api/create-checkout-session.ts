import { z } from 'zod'
import { appOrigin, requireEnv } from './_lib/env.js'
import { guardRequest, readJsonBody, requestId, sendError } from './_lib/http.js'
import { logEvent } from './_lib/log.js'
import { ensureProfile, authenticateBearer, supabaseAdmin } from './_lib/supabase.js'
import { stripeClient } from './_lib/stripe.js'
import type { ApiRequest, ApiResponse } from './_lib/types.js'

const checkoutSchema = z
  .object({
    successPath: z.string().startsWith('/').max(120).default('/?checkout=success'),
    cancelPath: z.string().startsWith('/').max(120).default('/?checkout=cancelled'),
  })
  .strict()

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (
    !(await guardRequest(req, res, {
      method: 'POST',
      rateLimit: { name: 'checkout', limit: 12, windowMs: 60_000 },
    }))
  ) {
    return
  }

  try {
    const user = await authenticateBearer(req.headers.authorization)

    if (!user) {
      return sendError(res, 401, 'unauthorized')
    }

    const body = checkoutSchema.parse(await readJsonBody(req))
    await ensureProfile(user)

    const admin = supabaseAdmin()
    const { data: existingLicense, error: licenseError } = await admin
      .from('lifetime_licenses')
      .select('id,status')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle()

    if (licenseError) {
      throw licenseError
    }

    if (existingLicense) {
      return res.status(200).json({ alreadyLicensed: true, url: `${appOrigin()}${body.successPath}` })
    }

    const session = await stripeClient().checkout.sessions.create({
      mode: 'payment',
      customer_email: user.email ?? undefined,
      client_reference_id: user.id,
      line_items: [
        {
          price: requireEnv('STRIPE_LIFETIME_PRICE_ID'),
          quantity: 1,
        },
      ],
      allow_promotion_codes: true,
      metadata: {
        user_id: user.id,
        product: 'aegis_ai_blocker_lifetime',
      },
      // Mirror the user id onto the payment intent so refunds and disputes can
      // be mapped back to a license even without the session id.
      payment_intent_data: {
        metadata: {
          user_id: user.id,
          product: 'aegis_ai_blocker_lifetime',
        },
      },
      success_url: `${appOrigin()}${body.successPath}`,
      cancel_url: `${appOrigin()}${body.cancelPath}`,
    })

    return res.status(200).json({ url: session.url })
  } catch (error) {
    logEvent('error', 'checkout_session_failed', { requestId: requestId(res) })
    return sendError(res, 400, error instanceof z.ZodError ? 'invalid_request' : 'checkout_failed')
  }
}
