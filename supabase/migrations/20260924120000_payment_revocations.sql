-- Durable refund/dispute markers, keyed by Stripe payment intent.
--
-- A refund or dispute can be processed while no license exists yet for its
-- payment (out-of-order delivery, or in the window between fulfilment's Stripe
-- check and its insert). The webhook records the revocation here BEFORE
-- touching licenses, and fulfilment checks here AFTER inserting a license, so
-- whichever runs second always sees the other. Server-only: RLS with no
-- policies and no client grants.
create table if not exists public.payment_revocations (
  payment_intent text primary key,
  status text not null check (status in ('refunded', 'revoked')),
  reason text not null,
  created_at timestamptz not null default now()
);

alter table public.payment_revocations enable row level security;
revoke all on table public.payment_revocations from anon, authenticated;
