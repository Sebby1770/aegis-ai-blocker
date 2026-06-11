-- Aegis AI Blocker Supabase schema
-- Apply in the Supabase SQL editor or convert into a migration with Supabase CLI.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  stripe_customer_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lifetime_licenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('stripe', 'apple', 'manual')),
  provider_reference text not null,
  stripe_customer_id text,
  status text not null default 'active' check (status in ('active', 'refunded', 'revoked')),
  purchased_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (provider, provider_reference)
);

create table if not exists public.payment_events (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null check (platform in ('web', 'ios', 'macos', 'router', 'other')),
  device_name text not null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.rule_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  rule_version text not null,
  enabled_categories text[] not null default '{}',
  strict_mode boolean not null default false,
  domain_count integer not null check (domain_count >= 0),
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists stripe_customer_id text;
alter table public.lifetime_licenses add column if not exists stripe_customer_id text;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

alter table public.profiles enable row level security;
alter table public.lifetime_licenses enable row level security;
alter table public.payment_events enable row level security;
alter table public.devices enable row level security;
alter table public.rule_snapshots enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "Users can read own licenses" on public.lifetime_licenses;
create policy "Users can read own licenses"
on public.lifetime_licenses for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can read own devices" on public.devices;
create policy "Users can read own devices"
on public.devices for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can add own devices" on public.devices;
create policy "Users can add own devices"
on public.devices for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own devices" on public.devices;
create policy "Users can update own devices"
on public.devices for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own devices" on public.devices;
create policy "Users can delete own devices"
on public.devices for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can read own rule snapshots" on public.rule_snapshots;
create policy "Users can read own rule snapshots"
on public.rule_snapshots for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can add own rule snapshots" on public.rule_snapshots;
create policy "Users can add own rule snapshots"
on public.rule_snapshots for insert
to authenticated
with check ((select auth.uid()) = user_id);

create index if not exists lifetime_licenses_user_id_idx on public.lifetime_licenses(user_id);
create index if not exists lifetime_licenses_stripe_customer_id_idx on public.lifetime_licenses(stripe_customer_id);

-- Refund/dispute mapping: ties Stripe charges back to licenses server-side.
alter table public.lifetime_licenses add column if not exists payment_intent text;
alter table public.lifetime_licenses add column if not exists revoked_at timestamptz;
create index if not exists lifetime_licenses_payment_intent_idx
on public.lifetime_licenses(payment_intent)
where payment_intent is not null;

-- Server-only audit trail. RLS enabled with no policies: service role only.
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor text not null default 'system',
  action text not null,
  subject_type text,
  subject_id text,
  user_id uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_logs enable row level security;

create index if not exists audit_logs_user_id_idx on public.audit_logs(user_id);
create index if not exists audit_logs_created_at_idx on public.audit_logs(created_at desc);
create index if not exists audit_logs_action_idx on public.audit_logs(action);

-- Durable rate limiting shared across serverless instances. Keys are SHA-256
-- hashes computed by the API layer; no raw IPs are stored. Service role only.
create table if not exists public.rate_limits (
  key text primary key,
  count integer not null default 0,
  reset_at timestamptz not null
);

alter table public.rate_limits enable row level security;

create index if not exists rate_limits_reset_at_idx on public.rate_limits(reset_at);

create or replace function public.consume_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_count integer;
begin
  insert into public.rate_limits as rl (key, count, reset_at)
  values (p_key, 1, v_now + make_interval(secs => p_window_seconds))
  on conflict (key) do update
    set count = case when rl.reset_at <= v_now then 1 else rl.count + 1 end,
        reset_at = case
          when rl.reset_at <= v_now then v_now + make_interval(secs => p_window_seconds)
          else rl.reset_at
        end
  returning rl.count into v_count;

  delete from public.rate_limits where reset_at < v_now - interval '1 day';

  return v_count <= p_limit;
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer) from public;
revoke all on function public.consume_rate_limit(text, integer, integer) from anon;
revoke all on function public.consume_rate_limit(text, integer, integer) from authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;
create unique index if not exists profiles_stripe_customer_id_key
on public.profiles(stripe_customer_id)
where stripe_customer_id is not null;
create index if not exists devices_user_id_idx on public.devices(user_id);
create index if not exists rule_snapshots_user_id_created_at_idx on public.rule_snapshots(user_id, created_at desc);

-- No policies are created for payment_events. It is writable only from trusted
-- server-side webhook code using the Supabase secret key after Stripe signature
-- verification.
--
-- Stripe/App Store webhook handlers should use a server-side Supabase secret key
-- to insert lifetime_licenses after verifying the signed payment event.
-- Never expose that key in Vite or iOS clients.
