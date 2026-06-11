import { afterEach, describe, expect, it, vi } from 'vitest'
import { logEvent, newRequestId } from './log.js'

afterEach(() => {
  vi.restoreAllMocks()
})

function captureLog(level: 'log' | 'warn' | 'error') {
  const lines: string[] = []
  vi.spyOn(console, level).mockImplementation((line: string) => {
    lines.push(line)
  })
  return lines
}

describe('newRequestId', () => {
  it('returns a UUID', () => {
    expect(newRequestId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })
})

describe('logEvent', () => {
  it('emits structured JSON with timestamp and level', () => {
    const lines = captureLog('log')
    logEvent('info', 'test_event', { requestId: 'abc' })

    const parsed = JSON.parse(lines[0]!) as Record<string, unknown>
    expect(parsed.event).toBe('test_event')
    expect(parsed.level).toBe('info')
    expect(parsed.requestId).toBe('abc')
    expect(typeof parsed.ts).toBe('string')
  })

  it('routes errors to console.error', () => {
    const lines = captureLog('error')
    logEvent('error', 'boom')
    expect(lines).toHaveLength(1)
  })

  it('redacts Stripe keys, webhook secrets, JWTs, and emails', () => {
    const lines = captureLog('log')
    logEvent('info', 'oops', {
      a: 'sk_live_abc123DEF',
      b: 'whsec_secretvalue99',
      c: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.dGVzdHNpZ25hdHVyZQ',
      d: 'person@example.com',
    })

    const line = lines[0]!
    expect(line).not.toContain('sk_live_abc123DEF')
    expect(line).not.toContain('whsec_secretvalue99')
    expect(line).not.toContain('person@example.com')
    expect(line).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0')
    expect(line).toContain('[redacted]')
  })

  it('drops undefined fields', () => {
    const lines = captureLog('log')
    logEvent('info', 'sparse', { present: 1, missing: undefined })
    const parsed = JSON.parse(lines[0]!) as Record<string, unknown>
    expect('missing' in parsed).toBe(false)
    expect(parsed.present).toBe(1)
  })
})
