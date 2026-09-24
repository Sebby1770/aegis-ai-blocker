import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'

// Boots an in-process Postgres (PGlite) that behaves like a Supabase project
// for the purposes of RLS and privilege tests: the anon / authenticated /
// service_role roles, auth.users, auth.uid() read from the request JWT claims
// exactly as PostgREST sets them, and Supabase's default privileges (every
// role gets ALL on new public tables and functions; RLS and explicit revokes
// are what actually protect data). Then it applies either the migrations in
// order or supabase/schema.sql, so both setup paths are tested.

const supabaseDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const SUPABASE_BOOTSTRAP = `
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

create schema auth;
create table auth.users (id uuid primary key, email text);

create function auth.uid() returns uuid language sql stable as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')
    ),
    ''
  )::uuid
$$;

create function auth.role() returns text language sql stable as $$
  select coalesce(
    current_setting('request.jwt.claim.role', true),
    (current_setting('request.jwt.claims', true)::jsonb ->> 'role')
  )::text
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`

export type SetupPath = 'migrations' | 'schema.sql'

export function migrationFiles() {
  const dir = path.join(supabaseDir, 'migrations')
  return readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => path.join(dir, file))
}

export async function createSupabaseDb(setup: SetupPath) {
  const db = new PGlite({ extensions: { pgcrypto } })
  await db.exec(SUPABASE_BOOTSTRAP)

  const files = setup === 'migrations' ? migrationFiles() : [path.join(supabaseDir, 'schema.sql')]
  for (const file of files) {
    await db.exec(readFileSync(file, 'utf8'))
  }

  return new SupabaseDb(db)
}

export class SupabaseDb {
  constructor(readonly pg: PGlite) {}

  // Runs `sql` as a PostgREST request would: inside a transaction, with the
  // role and JWT claims set locally. Returns rows, or throws the Postgres
  // error (e.g. "permission denied", "violates row-level security policy").
  async as<T = Record<string, unknown>>(
    who: { role: 'anon' } | { role: 'authenticated'; sub: string } | { role: 'service_role' },
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    const claims = JSON.stringify(who.role === 'authenticated' ? { role: who.role, sub: who.sub } : { role: who.role })

    return this.pg.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [claims])
      await tx.exec(`set local role ${who.role}`)
      const result = await tx.query<T>(sql, params)
      return result.rows
    })
  }

  async admin<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
    return (await this.pg.query<T>(sql, params)).rows
  }

  async createUser(id: string, email = `${id.slice(0, 8)}@example.com`) {
    await this.admin('insert into auth.users (id, email) values ($1, $2)', [id, email])
    await this.admin('insert into public.profiles (id, email) values ($1, $2)', [id, email])
  }

  // A stable, comparable description of everything that decides who can do
  // what: RLS flags, policies, table/column/function privileges for the API
  // roles, and check constraints. Used to prove schema.sql == migrations.
  async securitySnapshot() {
    const rls = await this.admin(`
      select c.relname, c.relrowsecurity as enabled, c.relforcerowsecurity as forced
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' order by 1`)

    const policies = await this.admin(`
      select tablename, policyname, permissive, roles::text, cmd, qual, with_check
      from pg_policies where schemaname = 'public' order by 1, 2`)

    const tableGrants = await this.admin(`
      select table_name, grantee, privilege_type
      from information_schema.role_table_grants
      where table_schema = 'public' and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
      order by 1, 2, 3`)

    const columnGrants = await this.admin(`
      select table_name, column_name, grantee, privilege_type
      from information_schema.column_privileges
      where table_schema = 'public' and grantee in ('anon', 'authenticated')
        and privilege_type in ('INSERT', 'UPDATE')
      order by 1, 2, 3, 4`)

    const functionAcl = await this.admin(`
      select p.proname, p.prosecdef as security_definer, p.proconfig::text as config,
             array(select r.rolname from pg_roles r
                   where r.rolname in ('anon', 'authenticated', 'service_role')
                     and has_function_privilege(r.rolname, p.oid, 'execute') order by 1)::text as executors
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' order by 1`)

    const constraints = await this.admin(`
      select conrelid::regclass::text as table_name, conname,
             replace(pg_get_constraintdef(oid), ' NOT VALID', '') as definition
      from pg_constraint
      where connamespace = 'public'::regnamespace and contype = 'c'
      order by 1, 2`)

    return { rls, policies, tableGrants, columnGrants, functionAcl, constraints }
  }

  close() {
    return this.pg.close()
  }
}
