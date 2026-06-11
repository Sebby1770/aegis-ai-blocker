import { randomUUID } from 'node:crypto'

type LogLevel = 'info' | 'warn' | 'error'

// Defense in depth: redact anything that looks like a credential or JWT if it
// ever reaches a log line. Logs must never contain tokens, emails, or secrets.
const REDACT_PATTERN = /(sk_live_[A-Za-z0-9]+|sk_test_[A-Za-z0-9]+|rk_live_[A-Za-z0-9]+|whsec_[A-Za-z0-9]+|eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g

export type LogFields = Record<string, string | number | boolean | null | undefined>

export function newRequestId() {
  return randomUUID()
}

export function logEvent(level: LogLevel, event: string, fields: LogFields = {}) {
  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    event,
  }

  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      entry[key] = value
    }
  }

  const line = JSON.stringify(entry).replace(REDACT_PATTERN, '[redacted]')

  if (level === 'error') {
    console.error(line)
  } else if (level === 'warn') {
    console.warn(line)
  } else {
    console.log(line)
  }
}
