-- Least privilege for client (PostgREST) writes.
--
-- devices and rule_snapshots back a future device-sync feature that no client
-- code uses yet, but their RLS policies let any signed-in account insert rows
-- of unbounded size. Sign-up is free (magic link), so a single script could
-- fill the database that license fulfilment depends on. Reads stay; writes are
-- removed until the feature ships with bounded policies of its own.

drop policy if exists "Users can add own devices" on public.devices;
drop policy if exists "Users can update own devices" on public.devices;
drop policy if exists "Users can delete own devices" on public.devices;
drop policy if exists "Users can add own rule snapshots" on public.rule_snapshots;

revoke insert, update, delete on table public.devices from anon, authenticated;
revoke insert, update, delete on table public.rule_snapshots from anon, authenticated;

-- Bound every free-text column a client can still write (profiles.email and
-- profiles.display_name via the column-scoped UPDATE grant), plus the
-- device-sync columns for when writes return. NOT VALID enforces the checks
-- on every new write without scanning or rejecting existing rows.
alter table public.profiles
  add constraint profiles_email_length check (char_length(email) <= 320) not valid;
alter table public.profiles
  add constraint profiles_display_name_length check (char_length(display_name) <= 100) not valid;
alter table public.devices
  add constraint devices_device_name_length check (char_length(device_name) <= 100) not valid;
alter table public.rule_snapshots
  add constraint rule_snapshots_bounded check (
    char_length(rule_version) <= 40
    and cardinality(enabled_categories) <= 32
    and domain_count <= 100000
  ) not valid;
