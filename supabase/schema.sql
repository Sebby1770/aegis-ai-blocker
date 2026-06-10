-- Aegis AI Blocker Supabase schema
-- Apply in the Supabase SQL editor or convert into a migration with Supabase CLI.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lifetime_licenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('stripe', 'apple', 'manual')),
  provider_reference text not null,
  status text not null default 'active' check (status in ('active', 'refunded', 'revoked')),
  purchased_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (provider, provider_reference)
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
create index if not exists devices_user_id_idx on public.devices(user_id);
create index if not exists rule_snapshots_user_id_created_at_idx on public.rule_snapshots(user_id, created_at desc);

-- Stripe/App Store webhook handlers should use a server-side service role key
-- to insert lifetime_licenses after verifying the signed payment event.
-- Never expose that service role key in Vite or iOS clients.
