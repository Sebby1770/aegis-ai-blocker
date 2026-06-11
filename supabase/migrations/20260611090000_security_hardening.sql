-- Security hardening: refund mapping, audit trail, durable rate limiting.

-- Map Stripe charges/refunds back to licenses without trusting client input.
alter table public.lifetime_licenses
  add column if not exists payment_intent text;

alter table public.lifetime_licenses
  add column if not exists revoked_at timestamptz;

create index if not exists lifetime_licenses_payment_intent_idx
  on public.lifetime_licenses(payment_intent)
  where payment_intent is not null;

-- Server-only audit trail for license lifecycle and payment processing.
-- RLS is enabled with no policies: only the service role can read or write.
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

-- Durable rate limiting shared across serverless instances.
-- Keys are SHA-256 hashes computed by the API layer; no raw IPs are stored.
-- RLS is enabled with no policies: only the service role can touch buckets.
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

  -- Opportunistic cleanup keeps the bucket table small.
  delete from public.rate_limits where reset_at < v_now - interval '1 day';

  return v_count <= p_limit;
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer) from public;
revoke all on function public.consume_rate_limit(text, integer, integer) from anon;
revoke all on function public.consume_rate_limit(text, integer, integer) from authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;
