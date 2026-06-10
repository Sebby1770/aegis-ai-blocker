import { allowedOrigins } from './env.js'
import type { ApiRequest, ApiResponse } from './types.js'

const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>()

export function setSecurityHeaders(res: ApiResponse) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Cache-Control', 'no-store')
}

export function sendError(res: ApiResponse, status: number, code: string) {
  setSecurityHeaders(res)
  return res.status(status).json({ error: code })
}

export function requireMethod(req: ApiRequest, res: ApiResponse, method: string) {
  if (req.method !== method) {
    res.setHeader('Allow', method)
    sendError(res, 405, 'method_not_allowed')
    return false
  }

  return true
}

export function enforceOrigin(req: ApiRequest, res: ApiResponse) {
  const origin = req.headers.origin

  if (!origin) {
    return true
  }

  const normalized = origin.replace(/\/$/, '')

  if (!allowedOrigins().has(normalized)) {
    sendError(res, 403, 'origin_not_allowed')
    return false
  }

  res.setHeader('Access-Control-Allow-Origin', normalized)
  res.setHeader('Vary', 'Origin')
  return true
}

export function rateLimit(req: ApiRequest, res: ApiResponse, options = { limit: 30, windowMs: 60_000 }) {
  const forwardedFor = req.headers['x-forwarded-for']
  const firstForwardedFor = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor
  const key = firstForwardedFor?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown'
  const now = Date.now()
  const bucket = rateLimitBuckets.get(key)

  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + options.windowMs })
    return true
  }

  bucket.count += 1

  if (bucket.count > options.limit) {
    sendError(res, 429, 'rate_limited')
    return false
  }

  return true
}

export async function readJsonBody<T>(req: ApiRequest, maxBytes = 4096): Promise<T> {
  if (req.body && typeof req.body === 'object') {
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
