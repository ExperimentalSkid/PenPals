-- The local CLI seed runs as the database superuser before an Auth session
-- exists. Keep the verified-email boundary for every client-facing role while
-- allowing that trusted setup operation to create its demo fixtures.
create or replace function public.require_verified_email_profile_write()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null and current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;
  if not public.is_email_verified() then
    raise exception 'Email verification required';
  end if;
  return new;
end;
$$;

revoke all on function public.require_verified_email_profile_write() from public, anon, authenticated;
