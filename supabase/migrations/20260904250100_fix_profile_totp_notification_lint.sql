-- Keep the grace-period notification lock implementation lint-clean.
create or replace function public.maybe_notify_profile_totp_reverification()
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid := auth.uid();
  locked_user uuid;
begin
  if me is null then return false; end if;
  select t.user_id into locked_user
    from public.profile_totp_verifications t
    join public.profiles p on p.id = t.user_id
   where t.user_id = me
     and not p.inactive_mode
     and now() >= t.reverify_after
     and now() < t.grace_until
     and t.notified_at is null
   for update;
  if locked_user is null then return false; end if;

  insert into public.notifications (user_id, type, related_id)
  values (me, 'profile_verification_reverify', gen_random_uuid());
  update public.profile_totp_verifications
     set notified_at = now(), updated_at = now()
   where user_id = me;
  return true;
end;
$$;

revoke all on function public.maybe_notify_profile_totp_reverification() from public, anon;
grant execute on function public.maybe_notify_profile_totp_reverification() to authenticated;
