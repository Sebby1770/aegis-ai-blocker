import { describe, expect, it } from 'vitest'
import { enforceOrigin, guardRequest, rateLimit, readJsonBody, readRawBody, requireMethod } from './http.js'
import type { ApiRequest, ApiResponse } from './types.js'

type MockResponse = ApiResponse & {
  statusCode: number
  body: unknown
  ended: boolean
}

function mockRes(): MockResponse {
  const headers = new Map<string, unknown>()

  const res = {
    statusCode: 0,
    body: undefined as unknown,
    ended: false,
    setHeader(name: string, value: unknown) {
      headers.set(name.toLowerCase(), value)
      return res
    },
    getHeader(name: string) {
      return headers.get(name.toLowerCase())
    },
    status(code: number) {
      res.statusCode = code
      return res
    },
    json(body: unknown) {
      res.body = body
    },
    end() {
      res.ended = true
    },
  }

  return res as unknown as MockResponse
}

function mockReq(overrides: Partial<{ method: string; headers: Record<string, string>; ip: string }> = {}) {
  return {
    method: overrides.method ?? 'GET',
    headers: overrides.headers ?? {},
    socket: { remoteAddress: overrides.ip ?? '203.0.113.10' },
  } as unknown as ApiRequest
}

function bodyReq(chunks: string[], method = 'POST') {
  return {
    method,
    headers: {},
    socket: { remoteAddress: '203.0.113.10' },
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield Buffer.from(chunk)
      }
    },
  } as unknown as ApiRequest
}

describe('requireMethod', () => {
  it('allows the expected method', () => {
    expect(requireMethod(mockReq({ method: 'GET' }), mockRes(), 'GET')).toBe(true)
  })

  it('rejects other methods with 405 and an Allow header', () => {
    const res = mockRes()
    expect(requireMethod(mockReq({ method: 'DELETE' }), res, 'POST')).toBe(false)
    expect(res.statusCode).toBe(405)
    expect(res.getHeader('Allow')).toContain('POST')
  })
})

describe('enforceOrigin', () => {
  it('allows requests without an Origin header', () => {
    expect(enforceOrigin(mockReq(), mockRes())).toBe(true)
  })

  it('allows configured local origins and echoes CORS headers', () => {
    const res = mockRes()
    const req = mockReq({ headers: { origin: 'http://localhost:5173' } })
    expect(enforceOrigin(req, res)).toBe(true)
    expect(res.getHeader('Access-Control-Allow-Origin')).toBe('http://localhost:5173')
  })

  it('rejects unknown origins with 403 and never echoes them', () => {
    const res = mockRes()
    const req = mockReq({ headers: { origin: 'https://evil.example' } })
    expect(enforceOrigin(req, res)).toBe(false)
    expect(res.statusCode).toBe(403)
    expect(res.getHeader('Access-Control-Allow-Origin')).toBeUndefined()
  })
})

describe('rateLimit (in-memory fallback)', () => {
  it('blocks after the limit inside one window', async () => {
    const options = { name: `test-${Math.random()}`, limit: 3, windowMs: 60_000 }

    for (let i = 0; i < 3; i += 1) {
      expect(await rateLimit(mockReq(), mockRes(), options)).toBe(true)
    }

    const res = mockRes()
    expect(await rateLimit(mockReq(), res, options)).toBe(false)
    expect(res.statusCode).toBe(429)
    expect(res.getHeader('Retry-After')).toBe('60')
  })

  it('tracks clients separately by IP', async () => {
    const options = { name: `test-${Math.random()}`, limit: 1, windowMs: 60_000 }
    expect(await rateLimit(mockReq({ ip: '203.0.113.1' }), mockRes(), options)).toBe(true)
    expect(await rateLimit(mockReq({ ip: '203.0.113.2' }), mockRes(), options)).toBe(true)
    expect(await rateLimit(mockReq({ ip: '203.0.113.1' }), mockRes(), options)).toBe(false)
  })
})

describe('guardRequest', () => {
  it('answers preflight requests with 204', async () => {
    const res = mockRes()
    const req = mockReq({ method: 'OPTIONS', headers: { origin: 'http://localhost:5173' } })
    expect(await guardRequest(req, res, { method: 'POST' })).toBe(false)
    expect(res.statusCode).toBe(204)
    expect(res.getHeader('Access-Control-Allow-Headers')).toContain('Authorization')
  })

  it('rejects wrong methods', async () => {
    const res = mockRes()
    expect(await guardRequest(mockReq({ method: 'GET' }), res, { method: 'POST' })).toBe(false)
    expect(res.statusCode).toBe(405)
  })

  it('sets security headers and a request id on success', async () => {
    const res = mockRes()
    expect(await guardRequest(mockReq({ method: 'GET' }), res, { method: 'GET' })).toBe(true)
    expect(res.getHeader('X-Content-Type-Options')).toBe('nosniff')
    expect(res.getHeader('Cache-Control')).toBe('no-store')
    expect(res.getHeader('Strict-Transport-Security')).toContain('max-age=')
    expect(typeof res.getHeader('X-Request-Id')).toBe('string')
  })
})

describe('readRawBody', () => {
  it('reads the full body', async () => {
    const body = await readRawBody(bodyReq(['hello ', 'world']))
    expect(body.toString('utf8')).toBe('hello world')
  })

  it('rejects bodies above the size limit', async () => {
    const oversized = bodyReq(['x'.repeat(2048)])
    await expect(readRawBody(oversized, 1024)).rejects.toThrow('request_too_large')
  })
})

describe('readJsonBody', () => {
  it('parses streamed JSON', async () => {
    const parsed = await readJsonBody<{ ok: boolean }>(bodyReq(['{"ok":true}']))
    expect(parsed.ok).toBe(true)
  })

  it('passes through pre-parsed object bodies', async () => {
    const req = mockReq({ method: 'POST' })
    ;(req as { body?: unknown }).body = { ok: 1 }
    expect(await readJsonBody(req)).toEqual({ ok: 1 })
  })

  it('parses string bodies', async () => {
    const req = mockReq({ method: 'POST' })
    ;(req as { body?: unknown }).body = '{"a":2}'
    expect(await readJsonBody(req)).toEqual({ a: 2 })
  })
})
