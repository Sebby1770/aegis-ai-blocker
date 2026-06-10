import { createClient } from '@supabase/supabase-js'
import { requireEnv } from './env.js'

export type AuthenticatedUser = {
  id: string
  email: string | null
}

export function supabaseAdmin() {
  const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY

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
