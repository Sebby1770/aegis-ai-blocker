-- Pin the trigger function's search_path (advisor: function_search_path_mutable).
-- Matches the hardening already applied to consume_rate_limit.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
