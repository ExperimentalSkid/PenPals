-- A deactivated account cannot use authenticated profile mutations through a
-- direct table call or a SECURITY DEFINER profile action. The reactivation
-- action is the only self-service lifecycle exception; Pause remains separate
-- because this guard only applies when deactivated_at is already set.
create or replace function public.protect_deactivated_profile_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'UPDATE'
     and old.deactivated_at is not null
     and auth.uid() = old.id
     and coalesce(current_setting('app.allow_account_status_change', true), '') <> '1' then
    raise exception 'Account is deactivated';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_deactivated_profile_mutation() from public, anon, authenticated;

drop trigger if exists profiles_deactivated_profile_guard on public.profiles;
create trigger profiles_deactivated_profile_guard
  before update on public.profiles
  for each row execute function public.protect_deactivated_profile_mutation();
