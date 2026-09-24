import { beforeEach, describe, expect, it, vi } from 'vitest'
import entitlement from '../entitlement.js'
import exportHandler from '../export.js'
import {
  auditActions,
  invoke,
  mockRequest,
  resetState,
  SERVICE_KEY_CANARY,
  state,
  TOKEN_A,
  TOKEN_B,
  USER_A,
  USER_B,
} from './harness.js'

vi.mock('@supabase/supabase-js', async () => (await import('./harness.js')).supabaseModule)
vi.mock('../_lib/stripe.js', async () => (await import('./harness.js')).stripeModule)

beforeEach(() => {
  resetState()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

function grantLicense(userId: string, status: 'active' | 'refunded' | 'revoked' = 'active') {
  state.db.rows('lifetime_licenses').push({
    id: `lic-${userId}-${status}`,
    user_id: userId,
    provider: 'stripe',
    provider_reference: `cs_${userId}_${status}`,
    payment_intent: `pi_${userId}`,
    status,
    purchased_at: '2026-09-01T00:00:00.000Z',
  })
}

function get(handler: typeof entitlement, url: string, token: string | null) {
  return invoke(
    handler,
    mockRequest({ method: 'GET', url, headers: token ? { authorization: `Bearer ${token}` } : {} }),
  )
}

describe('GET /api/entitlement', () => {
  it('requires a valid bearer token', async () => {
    expect((await get(entitlement, '/api/entitlement', null)).statusCode).toBe(401)
    expect((await get(entitlement, '/api/entitlement', 'not-a-real-token')).statusCode).toBe(401)
  })

  it("returns only the caller's license, whatever ids the query string names", async () => {
    grantLicense(USER_A)

    const own = await get(entitlement, '/api/entitlement', TOKEN_A)
    expect(own.body).toMatchObject({ licensed: true, license: { id: `lic-${USER_A}-active` } })

    const probe = await get(entitlement, `/api/entitlement?user_id=${USER_A}&id=lic-${USER_A}-active`, TOKEN_B)
    expect(probe.body).toEqual({ licensed: false, license: null })
  })

  it('does not expose payment references to the browser', async () => {
    grantLicense(USER_A)
    const res = await get(entitlement, '/api/entitlement', TOKEN_A)
    expect(res.text).not.toContain('pi_')
    expect(res.text).not.toContain('cs_')
  })

  it('reports refunded and revoked licenses as unlicensed', async () => {
    grantLicense(USER_A, 'refunded')
    grantLicense(USER_B, 'revoked')

    expect((await get(entitlement, '/api/entitlement', TOKEN_A)).body).toMatchObject({ licensed: false })
    expect((await get(entitlement, '/api/entitlement', TOKEN_B)).body).toMatchObject({ licensed: false })
  })

  it('is never cacheable', async () => {
    const res = await get(entitlement, '/api/entitlement', TOKEN_A)
    expect(res.getHeader('Cache-Control')).toBe('no-store')
  })

  it('fails closed with a generic error when the database errors', async () => {
    grantLicense(USER_A)
    state.db.failOnce('lifetime_licenses', 'select', `relation error key=${SERVICE_KEY_CANARY}`)
    const res = await get(entitlement, '/api/entitlement', TOKEN_A)

    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ error: 'entitlement_lookup_failed', requestId: expect.any(String) })
    expect(res.text).not.toContain(SERVICE_KEY_CANARY)
  })
})

describe('GET /api/export', () => {
  it('requires a valid bearer token', async () => {
    expect((await get(exportHandler, '/api/export', null)).statusCode).toBe(401)
  })

  it('requires an active license', async () => {
    const res = await get(exportHandler, '/api/export?format=hosts', TOKEN_A)
    expect(res.statusCode).toBe(403)
    expect(res.body).toMatchObject({ error: 'license_required' })
  })

  it("cannot ride on another user's license via query parameters", async () => {
    grantLicense(USER_A)
    const res = await get(exportHandler, `/api/export?format=hosts&user_id=${USER_A}`, TOKEN_B)
    expect(res.statusCode).toBe(403)
  })

  it('locks again after a refund or dispute', async () => {
    grantLicense(USER_A, 'refunded')
    grantLicense(USER_B, 'revoked')
    expect((await get(exportHandler, '/api/export', TOKEN_A)).statusCode).toBe(403)
    expect((await get(exportHandler, '/api/export', TOKEN_B)).statusCode).toBe(403)
  })

  it('serves a licensed download with a fixed filename and an audit record', async () => {
    grantLicense(USER_A)
    const res = await get(exportHandler, '/api/export?format=hosts&strict=1', TOKEN_A)

    expect(res.statusCode).toBe(200)
    expect(res.getHeader('Content-Disposition')).toBe('attachment; filename="aegis-ai-blocker-hosts-strict.txt"')
    expect(res.text).toContain('0.0.0.0 chatgpt.com')
    expect(auditActions()).toEqual(['export.downloaded'])
  })

  it.each(['../../etc/passwd', 'hosts%00', 'json', 'HOSTS'])('rejects unknown formats: %s', async (format) => {
    grantLicense(USER_A)
    const res = await get(exportHandler, `/api/export?format=${format}`, TOKEN_A)
    expect(res.statusCode).toBe(400)
  })
})
