-- Administrator accounts are managed by another administrator and cannot
-- voluntarily deactivate themselves.  Keep the check in the protected RPC so
-- UI removal cannot be bypassed by calling the function directly.
create or replace function public.deactivate_account()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null or not public.is_email_verified() then
    raise exception 'Email verification required';
  end if;
  if exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Administrator accounts cannot self-deactivate';
  end if;
  if exists (
    select 1 from public.profiles
    where id = auth.uid() and admin_deactivated_at is not null
  ) then
    raise exception 'Account status is controlled by an administrator';
  end if;

  perform set_config('app.allow_account_status_change', '1', true);
  update public.profiles
     set accepting_new_conversations_before_deactivation = accepting_new_conversations,
         deactivated_at = now(),
         accepting_new_conversations = false
   where id = auth.uid() and deactivated_at is null and admin_deactivated_at is null;
  perform set_config('app.allow_account_status_change', '', true);
end;
$$;

revoke all on function public.deactivate_account() from public, anon, authenticated;
grant execute on function public.deactivate_account() to authenticated;
