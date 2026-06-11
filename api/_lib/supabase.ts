import { createClient } from '@supabase/supabase-js'
import { requireEnv } from './env.js'
import { logEvent } from './log.js'

export type AuthenticatedUser = {
  id: string
  email: string | null
}

export type AuditLogEntry = {
  actor: string
  action: string
  subjectType?: string
  subjectId?: string
  userId?: string | null
  metadata?: Record<string, string | number | boolean | null>
}

function adminSecretKey() {
  return process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
}

export function hasSupabaseAdmin() {
  return Boolean(process.env.SUPABASE_URL && adminSecretKey())
}

export function supabaseAdmin() {
  const secretKey = adminSecretKey()

  if (!secretKey) {
    throw new Error('Missing required environment variable: SUPABASE_SECRET_KEY')
  }

  return createClient(requireEnv('SUPABASE_URL'), secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

export function supabaseAuthClient() {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_PUBLISHABLE_KEY'), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

export async function authenticateBearer(authorizationHeader: string | undefined) {
  const match = authorizationHeader?.match(/^Bearer\s+(.+)$/i)

  if (!match) {
    return null
  }

  const token = match[1]
  const { data, error } = await supabaseAuthClient().auth.getUser(token)

  if (error || !data.user) {
    return null
  }

  return {
    id: data.user.id,
    email: data.user.email ?? null,
  } satisfies AuthenticatedUser
}

export async function ensureProfile(user: AuthenticatedUser) {
  const client = supabaseAdmin()
  const { error } = await client.from('profiles').upsert(
    {
      id: user.id,
      email: user.email,
    },
    { onConflict: 'id' },
  )

  if (error) {
    throw error
  }
}

// Audit writes must never break payment processing: log and continue on error.
export async function writeAuditLog(entry: AuditLogEntry) {
  try {
    const { error } = await supabaseAdmin().from('audit_logs').insert({
      actor: entry.actor,
      action: entry.action,
      subject_type: entry.subjectType ?? null,
      subject_id: entry.subjectId ?? null,
      user_id: entry.userId ?? null,
      metadata: entry.metadata ?? {},
    })

    if (error) {
      throw error
    }
  } catch {
    logEvent('error', 'audit_log_write_failed', { action: entry.action })
  }
}
