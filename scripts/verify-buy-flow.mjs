// End-to-end buy-flow verification against the local dev server.
//
//   node scripts/verify-buy-flow.mjs [--keep]
//
// Requires `npm run dev` running, plus SUPABASE_SECRET_KEY and
// STRIPE_WEBHOOK_SECRET in .env.local. With STRIPE_SECRET_KEY also set, the
// real Checkout Session creation is exercised too; without it that leg is
// skipped and the webhook -> license -> entitlement chain is still verified
// using a self-signed synthetic event (same HMAC scheme Stripe uses).
//
// The script creates a throwaway auth user, runs the flow, asserts each leg,
// and deletes everything it created unless --keep is passed.

import { createHmac, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const keep = process.argv.includes('--keep')

// --- env ---------------------------------------------------------------------

function loadDotEnv(file) {
  try {
    for (const line of readFileSync(path.join(root, file), 'utf8').split('\n')) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
      if (match && process.env[match[1]] === undefined) {
        process.env[match[1]] = match[2].trim()
      }
    }
  } catch {
    // optional file
  }
}

loadDotEnv('.env.local')
loadDotEnv('.env')

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const PUBLISHABLE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET
const HAS_STRIPE_KEY = Boolean(process.env.STRIPE_SECRET_KEY)
const SERVER = process.env.VERIFY_SERVER ?? 'http://localhost:5180'

const missing = []
if (!SUPABASE_URL) missing.push('SUPABASE_URL / VITE_SUPABASE_URL')
if (!PUBLISHABLE_KEY) missing.push('SUPABASE_PUBLISHABLE_KEY / VITE_SUPABASE_PUBLISHABLE_KEY')
if (!SECRET_KEY) missing.push('SUPABASE_SECRET_KEY  (dashboard -> Settings -> API keys)')
if (!WEBHOOK_SECRET) missing.push('STRIPE_WEBHOOK_SECRET  (from `stripe listen`, or any test value for local-only runs)')

if (missing.length > 0) {
  console.error('Cannot run: add these to .env.local first —\n  - ' + missing.join('\n  - '))
  process.exit(1)
}

// --- helpers -------------------------------------------------------------------

const results = []
let failed = false

function report(leg, ok, detail) {
  results.push({ leg, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${leg}${detail ? ` — ${detail}` : ''}`)
  if (ok === false) {
    failed = true
  }
}

async function adminFetch(pathname, init = {}) {
  return fetch(`${SUPABASE_URL}${pathname}`, {
    ...init,
    headers: {
      apikey: SECRET_KEY,
      Authorization: `Bearer ${SECRET_KEY}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })
}

// --- run ------------------------------------------------------------------------

const email = `verify-buyflow-${randomUUID().slice(0, 8)}@example.com`
const password = `Vfy!${randomUUID()}`
let userId = null
const eventId = `evt_verify_${randomUUID().replace(/-/g, '')}`
const sessionId = `cs_test_verify_${randomUUID().replace(/-/g, '')}`

try {
  // 1. dev server up?
  const health = await fetch(`${SERVER}/api/health`).catch(() => null)
  report('dev server /api/health', health?.status === 200, health ? `HTTP ${health.status}` : 'not reachable — run `npm run dev`')
  if (health?.status !== 200) {
    process.exit(1)
  }

  // 2. throwaway user + password sign-in for a bearer token
  const createUser = await adminFetch('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email, password, email_confirm: true }),
  })
  const createdUser = await createUser.json()
  userId = createdUser.id ?? null
  report('create throwaway user (admin API)', createUser.status === 200 && Boolean(userId), `HTTP ${createUser.status}`)

  const tokenResponse = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const token = (await tokenResponse.json()).access_token
  report('sign in for bearer token', Boolean(token), `HTTP ${tokenResponse.status}`)

  if (!userId || !token) {
    process.exit(1)
  }

  // 3. real Checkout Session (needs STRIPE_SECRET_KEY)
  if (HAS_STRIPE_KEY) {
    const checkout = await fetch(`${SERVER}/api/create-checkout-session`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const checkoutBody = await checkout.json().catch(() => ({}))
    const url = typeof checkoutBody.url === 'string' ? checkoutBody.url : ''
    report(
      'create real Stripe Checkout Session',
      checkout.status === 200 && url.includes('stripe.com'),
      checkout.status === 200 ? url.slice(0, 60) + '…' : `HTTP ${checkout.status} ${JSON.stringify(checkoutBody)}`,
    )
  } else {
    console.log('SKIP  create real Stripe Checkout Session — STRIPE_SECRET_KEY not set')
  }

  // 4. signed synthetic checkout.session.completed -> license grant
  const event = {
    id: eventId,
    object: 'event',
    type: 'checkout.session.completed',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    data: {
      object: {
        id: sessionId,
        object: 'checkout.session',
        client_reference_id: userId,
        metadata: { user_id: userId, product: 'aegis_ai_blocker_lifetime' },
        payment_status: 'paid',
        payment_intent: `pi_verify_${randomUUID().replace(/-/g, '')}`,
        customer: null,
        customer_email: email,
        customer_details: { email },
        amount_total: 2900,
        currency: 'usd',
        created: Math.floor(Date.now() / 1000),
      },
    },
  }
  const payload = JSON.stringify(event)
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = createHmac('sha256', WEBHOOK_SECRET).update(`${timestamp}.${payload}`).digest('hex')
  const signatureHeader = `t=${timestamp},v1=${signature}`

  const webhook = await fetch(`${SERVER}/api/stripe-webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'stripe-signature': signatureHeader },
    body: payload,
  })
  const webhookBody = await webhook.json().catch(() => ({}))
  report(
    'signed webhook grants license',
    webhook.status === 200 && webhookBody.received === true,
    `HTTP ${webhook.status} ${JSON.stringify(webhookBody)}`,
  )

  // 5. entitlement now licensed
  const entitlement = await fetch(`${SERVER}/api/entitlement`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const entitlementBody = await entitlement.json().catch(() => ({}))
  report(
    'entitlement reports licensed',
    entitlement.status === 200 && entitlementBody.licensed === true,
    `HTTP ${entitlement.status} licensed=${entitlementBody.licensed}`,
  )

  // 6. replaying the same event is a no-op
  const replay = await fetch(`${SERVER}/api/stripe-webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'stripe-signature': signatureHeader },
    body: payload,
  })
  const replayBody = await replay.json().catch(() => ({}))
  report(
    'duplicate event is idempotent',
    replay.status === 200 && replayBody.duplicate === true,
    `HTTP ${replay.status} ${JSON.stringify(replayBody)}`,
  )
} finally {
  // 7. cleanup — deleting the user cascades profile + license rows.
  if (!keep && userId) {
    const dropEvent = await adminFetch(`/rest/v1/payment_events?event_id=eq.${eventId}`, { method: 'DELETE' })
    const dropUser = await adminFetch(`/auth/v1/admin/users/${userId}`, { method: 'DELETE' })
    report('cleanup (user, license, event rows)', dropUser.status === 200 && dropEvent.status < 300)
  } else if (keep) {
    console.log(`KEEP  test user ${email} (${userId}) and event ${eventId} left in place`)
  }
}

console.log(failed ? '\nBUY-FLOW: FAILED' : '\nBUY-FLOW: ALL CHECKS PASSED')
process.exit(failed ? 1 : 0)
