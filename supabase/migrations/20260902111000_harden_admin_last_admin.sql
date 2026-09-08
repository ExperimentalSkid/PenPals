-- Keep at least one active administrator during privileged role/account changes.
create or replace function public.set_user_role(target_user uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  old_role text;
begin
  if not public.is_admin() then
    raise exception 'Administrator authorization required';
  end if;
  if target_user = auth.uid() or new_role not in ('user', 'moderator', 'admin') then
    raise exception 'Invalid role change';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('penpal-admin-role-change', 0));
  select role into old_role from public.profiles where id = target_user for update;
  if old_role is null then
    raise exception 'User not found';
  end if;
  if old_role = new_role then
    return;
  end if;
  if old_role = 'admin' and new_role <> 'admin' and (select count(*) from public.profiles where role = 'admin' and deactivated_at is null) <= 1 then
    raise exception 'Cannot remove the last active administrator';
  end if;
  perform set_config('app.allow_role_change', '1', true);
  update public.profiles set role = new_role where id = target_user;
  insert into public.moderation_audit_log(moderator_id, target_user_id, action, old_status, new_status, metadata)
    values (auth.uid(), target_user, 'role_change', old_role, new_role, jsonb_build_object('target_user_id', target_user));
end;
$$;

revoke all on function public.set_user_role(uuid, text) from public;
grant execute on function public.set_user_role(uuid, text) to authenticated;

create or replace function public.admin_set_account_status(target_user uuid, should_deactivate boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  was_deactivated boolean;
  target_role text;
  new_state text;
begin
  if not public.is_admin() then
    raise exception 'Administrator authorization required';
  end if;
  if target_user = auth.uid() then
    raise exception 'Administrators cannot change their own account status';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('penpal-admin-role-change', 0));
  select (deactivated_at is not null), role into was_deactivated, target_role from public.profiles where id = target_user for update;
  if was_deactivated is null then
    raise exception 'User not found';
  end if;
  if was_deactivated = should_deactivate then
    return;
  end if;
  if should_deactivate and target_role = 'admin' and (select count(*) from public.profiles where role = 'admin' and deactivated_at is null) <= 1 then
    raise exception 'Cannot deactivate the last active administrator';
  end if;
  if should_deactivate then
    update public.profiles set deactivated_at = now(), accepting_new_conversations = false where id = target_user;
    new_state := 'deactivated';
  else
    update public.profiles set deactivated_at = null, accepting_new_conversations = true where id = target_user;
    new_state := 'active';
  end if;
  insert into public.moderation_audit_log(moderator_id, target_user_id, action, old_status, new_status, metadata)
    values (auth.uid(), target_user, case when should_deactivate then 'deactivate_account' else 'reactivate_account' end, case when was_deactivated then 'deactivated' else 'active' end, new_state, jsonb_build_object('target_user_id', target_user));
end;
$$;

revoke all on function public.admin_set_account_status(uuid, boolean) from public;
grant execute on function public.admin_set_account_status(uuid, boolean) to authenticated;
