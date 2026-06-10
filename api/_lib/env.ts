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

export function allowedOrigins() {
  const configured = new Set(
    [appOrigin(), process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`]
      .filter(Boolean)
      .map((origin) => origin!.replace(/\/$/, '')),
  )

  configured.add('http://localhost:5173')
  configured.add('http://127.0.0.1:5173')
  configured.add('http://localhost:4173')
  configured.add('http://127.0.0.1:4173')

  return configured
}
