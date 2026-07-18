-- Column-scope authenticated profile updates. The RLS policy restricts WHICH
-- row a user may update (their own) but not WHICH columns, so a signed-in user
-- could overwrite the server-managed billing linkage stripe_customer_id via
-- PostgREST. Revoke blanket UPDATE and grant it only on the columns users may
-- legitimately edit; the service role bypasses grants and RLS and continues to
-- manage stripe_customer_id from webhook/API code.

revoke update on table public.profiles from anon, authenticated;
grant update (email, display_name) on table public.profiles to authenticated;
