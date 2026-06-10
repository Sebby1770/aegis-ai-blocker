import { enforceOrigin, rateLimit, requireMethod, sendError, setSecurityHeaders } from './_lib/http.js'
import { authenticateBearer, ensureProfile, supabaseAdmin } from './_lib/supabase.js'
import type { ApiRequest, ApiResponse } from './_lib/types.js'

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setSecurityHeaders(res)

  if (!requireMethod(req, res, 'GET') || !enforceOrigin(req, res) || !rateLimit(req, res, { limit: 60, windowMs: 60_000 })) {
    return
  }

  try {
    const user = await authenticateBearer(req.headers.authorization)

    if (!user) {
      return sendError(res, 401, 'unauthorized')
    }

    await ensureProfile(user)

    const { data, error } = await supabaseAdmin()
      .from('lifetime_licenses')
      .select('id,provider,status,purchased_at')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('purchased_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      throw error
    }

    return res.status(200).json({
      licensed: Boolean(data),
      license: data ?? null,
    })
  } catch {
    console.error('entitlement_lookup_failed')
    return sendError(res, 500, 'entitlement_lookup_failed')
  }
}
