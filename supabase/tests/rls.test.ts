import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createSupabaseDb, type SetupPath, type SupabaseDb } from './supabase-pg'

// Row-level security and privilege tests against real Postgres semantics
// (PGlite), run for BOTH documented setup paths: `supabase db push` of the
// migrations, and pasting supabase/schema.sql into the SQL editor.

const USER_A = '11111111-1111-4111-8111-111111111111'
const USER_B = '22222222-2222-4222-8222-222222222222'
const LICENSE_A = 'aaaaaaaa-0000-4000-8000-000000000001'
const LICENSE_B = 'bbbbbbbb-0000-4000-8000-000000000002'

const asA = { role: 'authenticated', sub: USER_A } as const
const anon = { role: 'anon' } as const

const PRIVATE_TABLES = ['payment_events', 'audit_logs', 'rate_limits'] as const
const ALL_TABLES = ['profiles', 'lifetime_licenses', 'devices', 'rule_snapshots', ...PRIVATE_TABLES] as const

async function seed(db: SupabaseDb) {
  await db.createUser(USER_A)
  await db.createUser(USER_B)
  await db.admin(
    `insert into public.lifetime_licenses (id, user_id, provider, provider_reference, payment_intent, status)
     values ($1, $2, 'stripe', 'cs_a', 'pi_a', 'refunded'), ($3, $4, 'stripe', 'cs_b', 'pi_b', 'active')`,
    [LICENSE_A, USER_A, LICENSE_B, USER_B],
  )
  await db.admin(`insert into public.payment_events (event_id, event_type) values ('evt_1', 'charge.refunded')`)
  await db.admin(`insert into public.audit_logs (action, user_id) values ('license.activated', $1)`, [USER_B])
  await db.admin(`insert into public.rate_limits (key, count, reset_at) values ('k', 1, now() + interval '1 minute')`)
  await db.admin(`insert into public.devices (user_id, platform, device_name) values ($1, 'web', 'b-laptop')`, [USER_B])
}

describe.each<SetupPath>(['migrations', 'schema.sql'])('Supabase RLS and privileges (%s)', (setup) => {
  let db: SupabaseDb

  // Booting a WASM Postgres and applying the schema takes a few seconds.
  beforeAll(async () => {
    db = await createSupabaseDb(setup)
    await seed(db)
  }, 60_000)

  afterAll(async () => {
    await db.close()
  })

  describe('anon (publishable key, signed out)', () => {
    it.each(ALL_TABLES)('reads nothing from %s', async (table) => {
      await expect(db.as(anon, `select * from public.${table}`)).resolves.toEqual([])
    })

    it('cannot write licenses or profiles', async () => {
      await expect(
        db.as(anon, `insert into public.lifetime_licenses (user_id, provider, provider_reference) values ($1, 'manual', 'x')`, [USER_A]),
      ).rejects.toThrow()
      await expect(db.as(anon, `update public.profiles set display_name = 'x' returning id`)).rejects.toThrow()
    })
  })

  describe('authenticated user', () => {
    it('reads only their own profile and license', async () => {
      expect(await db.as(asA, 'select id from public.profiles')).toEqual([{ id: USER_A }])
      expect(await db.as(asA, 'select id from public.lifetime_licenses')).toEqual([{ id: LICENSE_A }])
      expect(await db.as(asA, 'select id from public.lifetime_licenses where user_id = $1', [USER_B])).toEqual([])
    })

    it('cannot grant themselves a license', async () => {
      await expect(
        db.as(
          asA,
          `insert into public.lifetime_licenses (user_id, provider, provider_reference, status)
           values ($1, 'manual', 'self-granted', 'active')`,
          [USER_A],
        ),
      ).rejects.toThrow(/row-level security|permission denied/)
    })

    it('cannot flip their refunded license back to active, or delete it', async () => {
      expect(await db.as(asA, `update public.lifetime_licenses set status = 'active' where id = $1 returning id`, [LICENSE_A])).toEqual([])
      expect(await db.as(asA, `delete from public.lifetime_licenses where id = $1 returning id`, [LICENSE_A])).toEqual([])

      expect(await db.admin('select status from public.lifetime_licenses where id = $1', [LICENSE_A])).toEqual([
        { status: 'refunded' },
      ])
    })

    it("cannot touch another user's license", async () => {
      expect(await db.as(asA, `update public.lifetime_licenses set user_id = $1 where id = $2 returning id`, [USER_A, LICENSE_B])).toEqual([])
      expect(await db.admin('select user_id from public.lifetime_licenses where id = $1', [LICENSE_B])).toEqual([
        { user_id: USER_B },
      ])
    })

    it.each(PRIVATE_TABLES)('cannot read or write the server-only %s table', async (table) => {
      expect(await db.as(asA, `select * from public.${table}`)).toEqual([])
    })

    it('cannot pre-mark a Stripe event as processed (which would suppress a revocation)', async () => {
      await expect(
        db.as(asA, `insert into public.payment_events (event_id, event_type) values ('evt_future_refund', 'charge.refunded')`),
      ).rejects.toThrow()
    })

    it('cannot call the service-only rate-limit function', async () => {
      await expect(db.as(asA, `select public.consume_rate_limit('k', 1000, 60)`)).rejects.toThrow(/permission denied/)
    })

    it('can edit their display name', async () => {
      expect(await db.as(asA, `update public.profiles set display_name = 'Ada' where id = $1 returning display_name`, [USER_A])).toEqual([
        { display_name: 'Ada' },
      ])
    })

    // Regression guard for the 2026-07-15 column-scoped UPDATE fix, on both
    // setup paths.
    it('cannot overwrite the server-managed stripe_customer_id', async () => {
      await expect(
        db.as(asA, `update public.profiles set stripe_customer_id = 'cus_victim' where id = $1 returning id`, [USER_A]),
      ).rejects.toThrow(/permission denied/)
    })

    it("cannot edit another user's profile", async () => {
      expect(await db.as(asA, `update public.profiles set display_name = 'pwned' where id = $1 returning id`, [USER_B])).toEqual([])
    })

    // FINDING: devices and rule_snapshots (a future sync feature no code uses
    // yet) accepted unbounded inserts from any signed-in account — and sign-up
    // is free — so one script could fill the production database that license
    // fulfilment depends on.
    it('cannot write to the unused device-sync tables', async () => {
      await expect(
        db.as(asA, `insert into public.devices (user_id, platform, device_name) values ($1, 'web', repeat('x', 1000000))`, [USER_A]),
      ).rejects.toThrow()
      await expect(
        db.as(
          asA,
          `insert into public.rule_snapshots (user_id, rule_version, enabled_categories, domain_count)
           values ($1, 'v', array_fill('x'::text, array[100000]), 1)`,
          [USER_A],
        ),
      ).rejects.toThrow()
    })

    it('cannot store unbounded text in their profile', async () => {
      await expect(
        db.as(asA, `update public.profiles set display_name = repeat('x', 100000) where id = $1 returning id`, [USER_A]),
      ).rejects.toThrow()
      await expect(
        db.as(asA, `update public.profiles set email = repeat('x', 100000) where id = $1 returning id`, [USER_A]),
      ).rejects.toThrow()
    })

    it('can still read their own devices', async () => {
      expect(await db.as({ role: 'authenticated', sub: USER_B }, 'select device_name from public.devices')).toEqual([
        { device_name: 'b-laptop' },
      ])
    })
  })

  describe('service role (serverless functions only)', () => {
    it('can write licenses and ledger rows', async () => {
      const rows = await db.as(
        { role: 'service_role' },
        `insert into public.lifetime_licenses (user_id, provider, provider_reference) values ($1, 'stripe', 'cs_service') returning status`,
        [USER_A],
      )
      expect(rows).toEqual([{ status: 'active' }])
      await expect(db.as({ role: 'service_role' }, `select public.consume_rate_limit('svc', 5, 60) as ok`)).resolves.toEqual([
        { ok: true },
      ])
    })
  })
})

describe('schema.sql stays equivalent to the migrations', () => {
  it('produces identical RLS flags, policies, grants, function ACLs and constraints', async () => {
    const fromMigrations = await createSupabaseDb('migrations')
    const fromSchema = await createSupabaseDb('schema.sql')

    try {
      expect(await fromSchema.securitySnapshot()).toEqual(await fromMigrations.securitySnapshot())
    } finally {
      await fromMigrations.close()
      await fromSchema.close()
    }
  }, 60_000)
})
