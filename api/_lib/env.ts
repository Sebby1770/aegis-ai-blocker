export function requireEnv(name: string) {
  const value = process.env[name]

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

export function appOrigin() {
  return process.env.APP_ORIGIN ?? process.env.VITE_APP_ORIGIN ?? 'http://localhost:5173'
}

// Vite dev (5173) and preview (4173) servers.
const LOCAL_DEV_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
]

// True on Vercel production and preview deployments (VERCEL_ENV is set by the
// platform; `vercel dev` reports 'development').
function isDeployed() {
  return process.env.VERCEL_ENV === 'production' || process.env.VERCEL_ENV === 'preview'
}

export function allowedOrigins() {
  const configured = new Set(
    [appOrigin(), process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`]
      .filter(Boolean)
      .map((origin) => origin!.replace(/\/$/, '')),
  )

  // Local dev origins are trusted only off-platform: in a deployment, a page
  // served from a visitor's own machine is not our app.
  if (!isDeployed()) {
    for (const origin of LOCAL_DEV_ORIGINS) {
      configured.add(origin)
    }
  }

  return configured
}
