-- Administrative account changes require an explicit, audited moderation reason.
-- Retain the old implementations as private helpers so there is no broad
-- client-facing privilege path without the reason requirement.

alter function public.set_user_role(uuid, text)
  rename to set_user_role_legacy;
revoke all on function public.set_user_role_legacy(uuid, text) from public;
revoke all on function public.set_user_role_legacy(uuid, text) from authenticated;

create function public.set_user_role(
  target_user uuid,
  new_role text,
  change_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  old_role text;
  clean_reason text := nullif(btrim(change_reason), '');
begin
  if not public.is_admin() then
    raise exception 'Administrator authorization required';
  end if;
  if target_user is null or target_user = auth.uid()
     or new_role is null or new_role not in ('user', 'moderator', 'admin') then
    raise exception 'Invalid role change';
  end if;
  if clean_reason is null or char_length(clean_reason) > 500 then
    raise exception 'A moderation reason is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('penpal-admin-role-change', 0));
  select role into old_role
    from public.profiles
    where id = target_user
    for update;
  if old_role is null then
    raise exception 'User not found';
  end if;
  if old_role = new_role then
    return;
  end if;
  if old_role = 'admin' and new_role <> 'admin'
     and (select count(*) from public.profiles where role = 'admin' and deactivated_at is null) <= 1 then
    raise exception 'Cannot remove the last active administrator';
  end if;

  perform set_config('app.allow_role_change', '1', true);
  update public.profiles set role = new_role where id = target_user;
  insert into public.moderation_audit_log(
    moderator_id, target_user_id, action, old_status, new_status, metadata
  ) values (
    auth.uid(), target_user, 'role_change', old_role, new_role,
    jsonb_build_object('target_user_id', target_user, 'reason', clean_reason)
  );
end;
$$;

revoke all on function public.set_user_role(uuid, text, text) from public;
grant execute on function public.set_user_role(uuid, text, text) to authenticated;

alter function public.admin_set_account_status(uuid, boolean)
  rename to admin_set_account_status_legacy;
revoke all on function public.admin_set_account_status_legacy(uuid, boolean) from public;
revoke all on function public.admin_set_account_status_legacy(uuid, boolean) from authenticated;

create function public.admin_set_account_status(
  target_user uuid,
  should_deactivate boolean,
  change_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  was_deactivated boolean;
  target_role text;
  new_state text;
  clean_reason text := nullif(btrim(change_reason), '');
begin
  if not public.is_admin() then
    raise exception 'Administrator authorization required';
  end if;
  if target_user is null or target_user = auth.uid() then
    raise exception 'Administrators cannot change their own account status';
  end if;
  if clean_reason is null or char_length(clean_reason) > 500 then
    raise exception 'A moderation reason is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('penpal-admin-role-change', 0));
  select (deactivated_at is not null), role
    into was_deactivated, target_role
    from public.profiles
    where id = target_user
    for update;
  if was_deactivated is null then
    raise exception 'User not found';
  end if;
  if was_deactivated = should_deactivate then
    return;
  end if;
  if should_deactivate and target_role = 'admin'
     and (select count(*) from public.profiles where role = 'admin' and deactivated_at is null) <= 1 then
    raise exception 'Cannot deactivate the last active administrator';
  end if;

  if should_deactivate then
    update public.profiles
      set deactivated_at = now(), accepting_new_conversations = false
      where id = target_user;
    new_state := 'deactivated';
  else
    update public.profiles
      set deactivated_at = null, accepting_new_conversations = true
      where id = target_user;
    new_state := 'active';
  end if;

  insert into public.moderation_audit_log(
    moderator_id, target_user_id, action, old_status, new_status, metadata
  ) values (
    auth.uid(), target_user,
    case when should_deactivate then 'deactivate_account' else 'reactivate_account' end,
    case when was_deactivated then 'deactivated' else 'active' end,
    new_state,
    jsonb_build_object('target_user_id', target_user, 'reason', clean_reason)
  );
end;
$$;

revoke all on function public.admin_set_account_status(uuid, boolean, text) from public;
grant execute on function public.admin_set_account_status(uuid, boolean, text) to authenticated;
