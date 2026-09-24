import { afterEach, describe, expect, it } from 'vitest'
import { allowedOrigins } from './env.js'

const saved = { ...process.env }

afterEach(() => {
  process.env = { ...saved }
})

describe('allowedOrigins', () => {
  it('allows the configured app origin and the Vercel production URL', () => {
    process.env.APP_ORIGIN = 'https://aegis.example/'
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'aegis-ai-blocker.vercel.app'

    const origins = allowedOrigins()
    expect(origins.has('https://aegis.example')).toBe(true)
    expect(origins.has('https://aegis-ai-blocker.vercel.app')).toBe(true)
  })

  it('allows local dev servers outside deployed environments', () => {
    delete process.env.VERCEL_ENV
    expect(allowedOrigins().has('http://localhost:5173')).toBe(true)
  })

  // FINDING: the production CORS allow-list always included localhost origins,
  // so any page served from a visitor's own machine was a trusted origin.
  it.each(['production', 'preview'])('never trusts localhost origins in a %s deployment', (env) => {
    process.env.VERCEL_ENV = env
    process.env.APP_ORIGIN = 'https://aegis.example'

    const origins = allowedOrigins()
    for (const origin of ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173']) {
      expect(origins.has(origin)).toBe(false)
    }
    expect(origins.has('https://aegis.example')).toBe(true)
  })
})
