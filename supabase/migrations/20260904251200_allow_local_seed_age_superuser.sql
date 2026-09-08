-- The bundled local fixture includes historical demo dates that are not
-- intended to exercise the production age gate. Keep all client writes
-- protected while allowing the trusted local seed superuser to load them.
create or replace function public.enforce_profile_age()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null and current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;
  if not public.is_adult_birth_date(new.birth_date) then
    raise exception 'You must be at least 18 years old to use Penpal.';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_profile_age() from public, anon, authenticated;
