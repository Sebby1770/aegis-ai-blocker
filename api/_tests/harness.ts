import { randomUUID } from 'node:crypto'
import Stripe from 'stripe'
import { vi } from 'vitest'
import type { ApiRequest, ApiResponse } from '../_lib/types.js'
import { FakeSupabase } from './fake-supabase.js'

// Shared harness for handler-level API tests. Test files wire it in with:
//
//   vi.mock('@supabase/supabase-js', async () => (await import('./harness.js')).supabaseModule)
//   vi.mock('../_lib/stripe.js', async () => (await import('./harness.js')).stripeModule)
//
// so the real handlers, guards, authenticateBearer, ensureProfile and
// writeAuditLog run unmodified against an in-memory database, and webhook
// signatures are produced and verified by the real Stripe SDK.

export const WEBHOOK_SECRET = 'whsec_unit_test_webhook_secret'
export const SERVICE_KEY_CANARY = 'sb_secret_UNIT_TEST_CANARY_do_not_leak'
export const APP_ORIGIN = 'https://aegis.example'
export const LIFETIME_PRICE = 'price_lifetime_test'

export const USER_A = '11111111-1111-4111-8111-111111111111'
export const USER_B = '22222222-2222-4222-8222-222222222222'
export const TOKEN_A = 'token-user-a'
export const TOKEN_B = 'token-user-b'

const realStripe = new Stripe('sk_test_unit_only')

function makeStripe() {
  return {
    webhooks: realStripe.webhooks,
    paymentIntents: {
      // Default: a clean, successful charge (no refund, no dispute).
      retrieve: vi.fn(async (id: string) => ({
        id,
        object: 'payment_intent',
        latest_charge: { id: `ch_for_${id}`, object: 'charge', refunded: false, amount_refunded: 0, disputed: false },
      })),
    },
    checkout: {
      sessions: {
        create: vi.fn(async () => ({ id: 'cs_test_created', url: 'https://checkout.stripe.com/c/pay/cs_test_created' })),
        list: vi.fn(async () => ({ data: [] as Array<{ id: string }> })),
      },
    },
  }
}

export const state = {
  db: new FakeSupabase(),
  stripe: makeStripe(),
}

export const supabaseModule = {
  createClient: () => state.db.client(),
}

export const stripeModule = {
  stripeClient: () => state.stripe,
}

export function resetState() {
  state.db = new FakeSupabase()
  state.stripe = makeStripe()
  state.db.addUser(TOKEN_A, USER_A)
  state.db.addUser(TOKEN_B, USER_B)

  Object.assign(process.env, {
    SUPABASE_URL: 'http://supabase.test',
    SUPABASE_SECRET_KEY: SERVICE_KEY_CANARY,
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_unit_test',
    STRIPE_SECRET_KEY: 'sk_test_unit_only',
    STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    STRIPE_LIFETIME_PRICE_ID: LIFETIME_PRICE,
    APP_ORIGIN,
  })
}

// --- requests and responses ---------------------------------------------------

export type MockResponse = ApiResponse & {
  statusCode: number
  body: unknown
  text: string
  headers: Map<string, unknown>
}

export function mockResponse(): MockResponse {
  const headers = new Map<string, unknown>()

  const res = {
    statusCode: 200,
    body: undefined as unknown,
    text: '',
    headers,
    headersSent: false,
    writableEnded: false,
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
      res.text = JSON.stringify(body)
      res.writableEnded = true
    },
    end(chunk?: string | Buffer) {
      if (chunk !== undefined) {
        res.text = chunk.toString()
      }
      res.writableEnded = true
    },
  }

  return res as unknown as MockResponse
}

export function mockRequest(options: {
  method?: string
  url?: string
  headers?: Record<string, string>
  body?: string
  ip?: string
}): ApiRequest {
  const body = options.body
  const headers = Object.fromEntries(
    Object.entries(options.headers ?? {}).map(([name, value]) => [name.toLowerCase(), value]),
  )

  return {
    method: options.method ?? 'GET',
    url: options.url ?? '/',
    headers,
    socket: { remoteAddress: options.ip ?? '203.0.113.50' },
    async *[Symbol.asyncIterator]() {
      if (body !== undefined) {
        yield Buffer.from(body)
      }
    },
  } as unknown as ApiRequest
}

export async function invoke(
  handler: (req: ApiRequest, res: ApiResponse) => Promise<unknown>,
  req: ApiRequest,
) {
  const res = mockResponse()
  await handler(req, res)
  return res
}

// --- Stripe fixtures -------------------------------------------------------------

export function signedWebhookRequest(
  event: object,
  options: { secret?: string; timestamp?: number; body?: string } = {},
) {
  const payload = JSON.stringify(event)
  const signature = realStripe.webhooks.generateTestHeaderString({
    payload,
    secret: options.secret ?? WEBHOOK_SECRET,
    timestamp: options.timestamp,
  })

  return mockRequest({
    method: 'POST',
    url: '/api/stripe-webhook',
    headers: { 'stripe-signature': signature, 'content-type': 'application/json' },
    body: options.body ?? payload,
  })
}

export function stripeEvent(type: string, object: object, id = `evt_${randomUUID().replace(/-/g, '')}`) {
  return {
    id,
    object: 'event',
    api_version: '2026-05-27.dahlia',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type,
    data: { object },
  }
}

// A Checkout Session exactly as api/create-checkout-session.ts creates it,
// after a successful card payment.
export function paidSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cs_test_paid_1',
    object: 'checkout.session',
    mode: 'payment',
    payment_status: 'paid',
    status: 'complete',
    amount_total: 2900,
    currency: 'usd',
    client_reference_id: USER_A,
    customer: null,
    customer_email: 'buyer@example.com',
    customer_details: { email: 'buyer@example.com' },
    payment_intent: 'pi_test_1',
    payment_link: null,
    metadata: { user_id: USER_A, product: 'aegis_ai_blocker_lifetime' },
    created: Math.floor(Date.now() / 1000),
    ...overrides,
  }
}

export function refundedCharge(paymentIntent = 'pi_test_1', overrides: Record<string, unknown> = {}) {
  return {
    id: 'ch_test_1',
    object: 'charge',
    payment_intent: paymentIntent,
    amount: 2900,
    amount_refunded: 2900,
    refunded: true,
    disputed: false,
    ...overrides,
  }
}

export function dispute(paymentIntent = 'pi_test_1') {
  return {
    id: 'dp_test_1',
    object: 'dispute',
    charge: 'ch_test_1',
    payment_intent: paymentIntent,
    amount: 2900,
    status: 'needs_response',
    reason: 'fraudulent',
  }
}

export function licensesFor(userId: string) {
  return state.db.rows('lifetime_licenses').filter((row) => row.user_id === userId)
}

export function auditActions() {
  return state.db.rows('audit_logs').map((row) => row.action)
}
