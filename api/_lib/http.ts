import { createHash } from 'node:crypto'
import { allowedOrigins } from './env.js'
import { logEvent, newRequestId } from './log.js'
import { hasSupabaseAdmin, supabaseAdmin } from './supabase.js'
import type { ApiRequest, ApiResponse } from './types.js'

const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>()

export type RateLimitOptions = {
  name: string
  limit: number
  windowMs: number
}

export type GuardOptions = {
  method: 'GET' | 'POST'
  rateLimit?: RateLimitOptions
  enforceOrigin?: boolean
}

export function setSecurityHeaders(res: ApiResponse) {
  if (!res.getHeader('X-Request-Id')) {
    res.setHeader('X-Request-Id', newRequestId())
  }

  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains')
}

export function requestId(res: ApiResponse) {
  const value = res.getHeader('X-Request-Id')
  return typeof value === 'string' ? value : 'unknown'
}

export function sendError(res: ApiResponse, status: number, code: string) {
  setSecurityHeaders(res)
  return res.status(status).json({ error: code, requestId: requestId(res) })
}

export function requireMethod(req: ApiRequest, res: ApiResponse, method: string) {
  if (req.method !== method) {
    res.setHeader('Allow', `${method}, OPTIONS`)
    sendError(res, 405, 'method_not_allowed')
    return false
  }

  return true
}

function resolveAllowedOrigin(req: ApiRequest) {
  const origin = req.headers.origin

  if (!origin) {
    return { present: false, allowed: true, normalized: '' }
  }

  const normalized = origin.replace(/\/$/, '')
  return { present: true, allowed: allowedOrigins().has(normalized), normalized }
}

export function handlePreflight(req: ApiRequest, res: ApiResponse, method: GuardOptions['method']) {
  if (req.method !== 'OPTIONS') {
    return false
  }

  const origin = resolveAllowedOrigin(req)

  if (origin.present && origin.allowed) {
    res.setHeader('Access-Control-Allow-Origin', origin.normalized)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Methods', `${method}, OPTIONS`)
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    res.setHeader('Access-Control-Max-Age', '86400')
  }

  res.status(204).end()
  return true
}

export function enforceOrigin(req: ApiRequest, res: ApiResponse) {
  const origin = resolveAllowedOrigin(req)

  // Non-browser clients (Stripe, curl, native apps) send no Origin header.
  // Browser CSRF requires an Origin, so absence is safe to allow; bearer-token
  // auth still applies on every protected route.
  if (!origin.present) {
    return true
  }

  if (!origin.allowed) {
    sendError(res, 403, 'origin_not_allowed')
    return false
  }

  res.setHeader('Access-Control-Allow-Origin', origin.normalized)
  res.setHeader('Vary', 'Origin')
  return true
}

function clientIp(req: ApiRequest) {
  const forwardedFor = req.headers['x-forwarded-for']
  const firstForwardedFor = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor
  return firstForwardedFor?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown'
}

function memoryRateLimit(key: string, options: RateLimitOptions) {
  const now = Date.now()
  const bucket = rateLimitBuckets.get(key)

  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + options.windowMs })
    return true
  }

  bucket.count += 1
  return bucket.count <= options.limit
}

// Cross-instance rate limiting backed by Postgres. Buckets are keyed by a
// SHA-256 hash so no raw client IPs are persisted. Falls back to per-instance
// in-memory buckets when the database is unavailable so a Supabase outage
// degrades protection instead of taking the API down.
export async function rateLimit(req: ApiRequest, res: ApiResponse, options: RateLimitOptions) {
  const key = createHash('sha256').update(`${options.name}:${clientIp(req)}`).digest('hex')
  let allowed: boolean

  if (hasSupabaseAdmin()) {
    try {
      const { data, error } = await supabaseAdmin().rpc('consume_rate_limit', {
        p_key: key,
        p_limit: options.limit,
        p_window_seconds: Math.ceil(options.windowMs / 1000),
      })

      if (error) {
        throw error
      }

      allowed = data === true
    } catch {
      logEvent('warn', 'rate_limit_fallback', { name: options.name, requestId: requestId(res) })
      allowed = memoryRateLimit(key, options)
    }
  } else {
    allowed = memoryRateLimit(key, options)
  }

  if (!allowed) {
    res.setHeader('Retry-After', Math.ceil(options.windowMs / 1000).toString())
    sendError(res, 429, 'rate_limited')
    return false
  }

  return true
}

// Shared request gate: headers, preflight, method, origin, and rate limit in
// one call. Returns false when the request has already been answered.
export async function guardRequest(req: ApiRequest, res: ApiResponse, options: GuardOptions) {
  setSecurityHeaders(res)

  if (handlePreflight(req, res, options.method)) {
    return false
  }

  if (!requireMethod(req, res, options.method)) {
    return false
  }

  if ((options.enforceOrigin ?? true) && !enforceOrigin(req, res)) {
    return false
  }

  if (options.rateLimit && !(await rateLimit(req, res, options.rateLimit))) {
    return false
  }

  return true
}

export async function readJsonBody<T>(req: ApiRequest, maxBytes = 4096): Promise<T> {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body as T
  }

  if (typeof req.body === 'string') {
    return JSON.parse(req.body) as T
  }

  if (Buffer.isBuffer(req.body)) {
    return JSON.parse(req.body.toString('utf8')) as T
  }

  const raw = await readRawBody(req, maxBytes)
  return JSON.parse(raw.toString('utf8')) as T
}

export async function readRawBody(req: ApiRequest, maxBytes = 1_000_000) {
  const chunks: Buffer[] = []
  let size = 0

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length

    if (size > maxBytes) {
      throw new Error('request_too_large')
    }

    chunks.push(buffer)
  }

  return Buffer.concat(chunks)
}
