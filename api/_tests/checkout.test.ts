import { beforeEach, describe, expect, it, vi } from 'vitest'
import handler from '../create-checkout-session.js'
import {
  APP_ORIGIN,
  invoke,
  LIFETIME_PRICE,
  mockRequest,
  resetState,
  SERVICE_KEY_CANARY,
  state,
  TOKEN_A,
  USER_A,
} from './harness.js'

vi.mock('@supabase/supabase-js', async () => (await import('./harness.js')).supabaseModule)
vi.mock('../_lib/stripe.js', async () => (await import('./harness.js')).stripeModule)

beforeEach(() => {
  resetState()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

function checkout(body: unknown, token: string | null = TOKEN_A, headers: Record<string, string> = {}) {
  return invoke(
    handler,
    mockRequest({
      method: 'POST',
      url: '/api/create-checkout-session',
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
  )
}

type SessionParams = {
  line_items: Array<{ price: string; quantity: number }>
  client_reference_id: string
  metadata: Record<string, string>
  success_url: string
  cancel_url: string
  mode: string
}

function createdSession() {
  expect(state.stripe.checkout.sessions.create).toHaveBeenCalledTimes(1)
  return (state.stripe.checkout.sessions.create.mock.calls[0] as unknown as [SessionParams])[0]
}

describe('POST /api/create-checkout-session', () => {
  it('requires a valid bearer token', async () => {
    expect((await checkout({}, null)).statusCode).toBe(401)
    expect((await checkout({}, 'forged-token')).statusCode).toBe(401)
    expect(state.stripe.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it('creates a one-item session at the server-configured price, bound to the token user', async () => {
    const res = await checkout({ successPath: '/app?checkout=success', cancelPath: '/app?checkout=cancelled' })

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ url: 'https://checkout.stripe.com/c/pay/cs_test_created' })
    const params = createdSession()
    expect(params.mode).toBe('payment')
    expect(params.line_items).toEqual([{ price: LIFETIME_PRICE, quantity: 1 }])
    expect(params.client_reference_id).toBe(USER_A)
    expect(params.metadata).toEqual({ user_id: USER_A, product: 'aegis_ai_blocker_lifetime' })
  })

  it.each([
    [{ price: 'price_attacker_cheap' }],
    [{ priceId: 'price_attacker_cheap' }],
    [{ amount: 1 }],
    [{ quantity: 0 }],
    [{ userId: '22222222-2222-4222-8222-222222222222' }],
    [{ successPath: '/app', line_items: [{ price: 'price_x', quantity: 1 }] }],
  ])('rejects client-chosen commercial terms or identity: %j', async (body) => {
    const res = await checkout(body)

    expect(res.statusCode).toBe(400)
    expect(res.body).toMatchObject({ error: 'invalid_request' })
    expect(state.stripe.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it.each(['https://evil.example/phish', 'evil.example', '@evil.example', 'javascript:alert(1)'])(
    'rejects redirect paths that are not same-origin paths: %s',
    async (successPath) => {
      const res = await checkout({ successPath })
      expect(res.statusCode).toBe(400)
      expect(state.stripe.checkout.sessions.create).not.toHaveBeenCalled()
    },
  )

  it.each(['//evil.example/phish', '/\\evil.example', '/%2F%2Fevil.example', '/.evil.example', '/@evil.example'])(
    'keeps tricky-but-valid paths on the app origin (no open redirect): %s',
    async (path) => {
      const res = await checkout({ successPath: path, cancelPath: path })

      if (res.statusCode === 200) {
        const params = createdSession()
        expect(new URL(params.success_url).origin).toBe(APP_ORIGIN)
        expect(new URL(params.cancel_url).origin).toBe(APP_ORIGIN)
      } else {
        expect(res.statusCode).toBe(400)
      }
    },
  )

  it('does not start a second purchase for an account that already holds an active license', async () => {
    state.db.rows('lifetime_licenses').push({
      id: 'lic-1',
      user_id: USER_A,
      provider: 'stripe',
      provider_reference: 'cs_old',
      status: 'active',
    })
    const res = await checkout({})

    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ alreadyLicensed: true })
    expect(state.stripe.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it('rejects cross-origin browser requests', async () => {
    const res = await checkout({}, TOKEN_A, { origin: 'https://evil.example' })
    expect(res.statusCode).toBe(403)
  })

  it('answers 429 once the durable rate limit is exhausted', async () => {
    state.db.rateLimitAllowed = false
    const res = await checkout({})
    expect(res.statusCode).toBe(429)
    expect(res.getHeader('Retry-After')).toBe('60')
  })

  it('returns a generic error without internals when configuration or a dependency fails', async () => {
    delete process.env.STRIPE_LIFETIME_PRICE_ID
    const missingEnv = await checkout({})
    expect(missingEnv.statusCode).toBe(400)
    expect(missingEnv.text).not.toContain('STRIPE_LIFETIME_PRICE_ID')

    resetState()
    state.db.failOnce('lifetime_licenses', 'select', `permission denied (${SERVICE_KEY_CANARY})`)
    const dbError = await checkout({})
    expect(Object.keys(dbError.body as object).sort()).toEqual(['error', 'requestId'])
    expect(dbError.text).not.toContain(SERVICE_KEY_CANARY)
  })
})
