-- Local demo fixtures use external avatar URLs. Client-facing writes still
-- require a private storage path; only the trusted local seed superuser is
-- allowed to retain those legacy fixture values.
create or replace function public.enforce_private_avatar_path()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.avatar_path is not null
     and current_user not in ('postgres', 'supabase_admin')
     and not public.is_private_avatar_path(new.id, new.avatar_path) then
    raise exception 'Invalid avatar path';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_private_avatar_path() from public, anon, authenticated;
