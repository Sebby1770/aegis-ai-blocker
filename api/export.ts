import { z } from 'zod'
import { guardRequest, requestId, sendError } from './_lib/http.js'
import { logEvent } from './_lib/log.js'
import { authenticateBearer, supabaseAdmin, writeAuditLog } from './_lib/supabase.js'
import type { ApiRequest, ApiResponse } from './_lib/types.js'
import {
  buildExport,
  extensionForFormat,
  getActiveDomains,
  rulePack,
  type ExportFormat,
} from '../src/lib/blocklists.js'

const querySchema = z.object({
  format: z.enum(['adguard', 'hosts', 'dnsmasq', 'plain', 'safari']).default('adguard'),
  strict: z.enum(['0', '1']).default('0'),
})

const allCategoriesEnabled = Object.fromEntries(rulePack.categories.map((category) => [category.id, true]))

// Canonical, server-side rule downloads for licensed accounts. The dashboard
// generates files in the browser for instant UX; this endpoint exists for
// automation — curl, router cron jobs, and shortcuts that want the latest
// pack without a browser session.
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (
    !(await guardRequest(req, res, {
      method: 'GET',
      rateLimit: { name: 'export', limit: 30, windowMs: 60_000 },
    }))
  ) {
    return
  }

  try {
    const user = await authenticateBearer(req.headers.authorization)

    if (!user) {
      return sendError(res, 401, 'unauthorized')
    }

    const url = new URL(req.url ?? '/', 'http://localhost')
    const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams))

    if (!parsed.success) {
      return sendError(res, 400, 'invalid_request')
    }

    const { data: license, error: licenseError } = await supabaseAdmin()
      .from('lifetime_licenses')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()

    if (licenseError) {
      throw licenseError
    }

    if (!license) {
      return sendError(res, 403, 'license_required')
    }

    const format = parsed.data.format as ExportFormat
    const strict = parsed.data.strict === '1'
    const body = buildExport(format, getActiveDomains(allCategoriesEnabled, strict))
    const filename = `aegis-ai-blocker-${format}${strict ? '-strict' : ''}.${extensionForFormat(format)}`

    await writeAuditLog({
      actor: 'api',
      action: 'export.downloaded',
      subjectType: 'rule_pack',
      subjectId: rulePack.version,
      userId: user.id,
      metadata: { format, strict },
    })

    res.setHeader('Content-Type', format === 'safari' ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('X-Rule-Pack-Version', rulePack.version)
    res.statusCode = 200
    res.end(body)
    return
  } catch {
    logEvent('error', 'export_failed', { requestId: requestId(res) })
    return sendError(res, 500, 'export_failed')
  }
}
