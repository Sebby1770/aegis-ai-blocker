// Proves server secrets cannot reach the browser bundle.
//
//   node scripts/check-bundle-secrets.mjs
//
// Builds the SPA with unique canary values in every server-only environment
// variable (plus a canary in a VITE_ variable, to prove env injection actually
// ran), then scans every emitted file. Fails if any server canary — or any
// string shaped like a Stripe/Supabase secret — appears in the output.

import { randomBytes } from 'node:crypto'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

// Canaries are generated per run, in the real key formats, so the shape
// checks below exercise the same patterns a leaked production key would hit —
// and so no secret-shaped literal ever sits in this file for secret scanners.
const canary = (prefix) => `${prefix}${randomBytes(16).toString('hex')}`

const serverCanaries = {
  SUPABASE_SECRET_KEY: canary(['sb', 'secret', ''].join('_')),
  SUPABASE_SERVICE_ROLE_KEY: canary('service-role-canary-'),
  STRIPE_SECRET_KEY: canary(['sk', 'test', ''].join('_')),
  STRIPE_WEBHOOK_SECRET: canary(['whsec', ''].join('_')),
  STRIPE_LIFETIME_PRICE_ID: canary('price_'),
}
const publicCanary = canary('sb_publishable_')

Object.assign(process.env, serverCanaries, {
  VITE_SUPABASE_URL: 'https://canary-project.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: publicCanary,
})

// Real secrets have these shapes; none may ever appear in client output.
const SECRET_SHAPES = [
  /sk_(live|test)_[A-Za-z0-9]{8,}/,
  /rk_(live|test)_[A-Za-z0-9]{8,}/,
  /whsec_[A-Za-z0-9]{8,}/,
  /sb_secret_[A-Za-z0-9_-]{8,}/,
]

const outDir = await mkdtemp(path.join(tmpdir(), 'aegis-bundle-check-'))

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      yield* walk(full)
    } else {
      yield full
    }
  }
}

try {
  await build({ root, logLevel: 'error', build: { outDir, emptyOutDir: true } })

  const problems = []
  let sawPublicCanary = false
  let files = 0

  for await (const file of walk(outDir)) {
    files += 1
    const text = await readFile(file, 'utf8')
    const rel = path.relative(outDir, file)

    if (text.includes(publicCanary)) {
      sawPublicCanary = true
    }

    for (const [name, canary] of Object.entries(serverCanaries)) {
      if (text.includes(canary)) {
        problems.push(`${rel}: contains the value of server-only ${name}`)
      }
    }

    for (const shape of SECRET_SHAPES) {
      const match = text.match(shape)
      if (match) {
        problems.push(`${rel}: contains a secret-shaped string (${match[0].slice(0, 12)}…)`)
      }
    }

    if (rel.endsWith('.map')) {
      problems.push(`${rel}: source map emitted to production output`)
    }
  }

  if (!sawPublicCanary) {
    problems.push('the VITE_ publishable-key canary never reached the bundle, so this check proved nothing')
  }

  if (problems.length > 0) {
    console.error(`Bundle secret check FAILED:\n  - ${problems.join('\n  - ')}`)
    process.exitCode = 1
  } else {
    console.log(
      `Bundle secret check passed: ${files} files scanned, no server secrets or secret-shaped strings; ` +
        'publishable key present as expected.',
    )
  }
} finally {
  await rm(outDir, { recursive: true, force: true })
}
