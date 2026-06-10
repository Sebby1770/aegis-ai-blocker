import { z } from 'zod'
import { appOrigin, requireEnv } from './_lib/env.js'
import { enforceOrigin, rateLimit, readJsonBody, requireMethod, sendError, setSecurityHeaders } from './_lib/http.js'
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
  setSecurityHeaders(res)

  if (!requireMethod(req, res, 'POST') || !enforceOrigin(req, res) || !rateLimit(req, res, { limit: 12, windowMs: 60_000 })) {
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
      metadata: {
        user_id: user.id,
        product: 'aegis_ai_blocker_lifetime',
      },
      success_url: `${appOrigin()}${body.successPath}`,
      cancel_url: `${appOrigin()}${body.cancelPath}`,
    })

    return res.status(200).json({ url: session.url })
  } catch (error) {
    console.error('checkout_session_failed')
    return sendError(res, 400, error instanceof z.ZodError ? 'invalid_request' : 'checkout_failed')
  }
}
