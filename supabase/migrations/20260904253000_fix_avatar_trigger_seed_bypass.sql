-- SECURITY DEFINER functions execute with their owner as current_user.  The
-- previous avatar-path guard therefore treated every client update as the
-- database superuser and allowed external URLs through.  Keep the local seed
-- compatibility exception only for calls with no authenticated identity;
-- authenticated and service-role profile writes must still use an owner-
-- scoped private Storage path.
create or replace function public.enforce_private_avatar_path()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.avatar_path is not null
     and not (auth.uid() is null and current_user in ('postgres', 'supabase_admin'))
     and not public.is_private_avatar_path(new.id, new.avatar_path) then
    raise exception 'Invalid avatar path';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_private_avatar_path() from public, anon, authenticated;
