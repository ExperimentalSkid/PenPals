-- Keep administrator deactivation distinct from voluntary self-deactivation.
-- The marker is private and is only used to prevent the affected account from
-- undoing an administrator's decision.
alter table public.profiles
  add column if not exists admin_deactivated_at timestamptz;

create or replace function public.protect_account_deactivation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    new.deactivated_at := null;
    new.admin_deactivated_at := null;
  elsif (new.deactivated_at is distinct from old.deactivated_at
         or new.admin_deactivated_at is distinct from old.admin_deactivated_at)
        and coalesce(current_setting('app.allow_account_status_change', true), '') <> '1' then
    raise exception 'Account status changes require the protected account status action';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_account_deactivation_guard on public.profiles;
create trigger profiles_account_deactivation_guard
  before insert or update of deactivated_at, admin_deactivated_at on public.profiles
  for each row execute function public.protect_account_deactivation();

-- Self-deactivation remains available, but an administrator-owned status cannot
-- be cleared by the affected account.  The protected setting is transaction
-- local and can only be enabled by these trusted SECURITY DEFINER routines.
create or replace function public.deactivate_account()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
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
end;
$$;

create or replace function public.reactivate_account()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1 from public.profiles
    where id = auth.uid() and admin_deactivated_at is not null
  ) then
    raise exception 'Account status is controlled by an administrator';
  end if;

  perform set_config('app.allow_account_status_change', '1', true);
  update public.profiles
     set deactivated_at = null,
         accepting_new_conversations = coalesce(accepting_new_conversations_before_deactivation, accepting_new_conversations),
         accepting_new_conversations_before_deactivation = null
   where id = auth.uid() and deactivated_at is not null and admin_deactivated_at is null;
end;
$$;

create or replace function public.admin_set_account_status(
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
  was_admin_deactivated boolean;
  target_role text;
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
  select (deactivated_at is not null), (admin_deactivated_at is not null), role
    into was_deactivated, was_admin_deactivated, target_role
    from public.profiles
    where id = target_user
    for update;
  if was_deactivated is null then
    raise exception 'User not found';
  end if;

  -- An already-deactivated account can still be claimed by an administrator;
  -- this closes the gap where a prior self-deactivation was reactivated after
  -- an admin action that appeared to be a no-op.
  if should_deactivate and was_deactivated and not was_admin_deactivated then
    perform set_config('app.allow_account_status_change', '1', true);
    update public.profiles
       set admin_deactivated_at = now()
     where id = target_user;
    insert into public.moderation_audit_log(
      moderator_id, target_user_id, action, old_status, new_status, metadata
    ) values (
      auth.uid(), target_user, 'deactivate_account', 'deactivated', 'deactivated',
      jsonb_build_object('target_user_id', target_user, 'reason', clean_reason)
    );
    return;
  end if;

  if was_deactivated = should_deactivate then
    return;
  end if;
  if should_deactivate and target_role = 'admin'
     and (select count(*) from public.profiles where role = 'admin' and deactivated_at is null) <= 1 then
    raise exception 'Cannot deactivate the last active administrator';
  end if;

  perform set_config('app.allow_account_status_change', '1', true);
  if should_deactivate then
    update public.profiles
       set admin_deactivated_at = now(),
           deactivated_at = now(),
           accepting_new_conversations = false
     where id = target_user;
  else
    update public.profiles
       set admin_deactivated_at = null,
           deactivated_at = null,
           accepting_new_conversations = true
     where id = target_user;
  end if;

  insert into public.moderation_audit_log(
    moderator_id, target_user_id, action, old_status, new_status, metadata
  ) values (
    auth.uid(), target_user,
    case when should_deactivate then 'deactivate_account' else 'reactivate_account' end,
    case when was_deactivated then 'deactivated' else 'active' end,
    case when should_deactivate then 'deactivated' else 'active' end,
    jsonb_build_object('target_user_id', target_user, 'reason', clean_reason)
  );
end;
$$;

revoke all on function public.protect_account_deactivation() from public, anon, authenticated;
revoke all on function public.deactivate_account() from public, anon, authenticated;
revoke all on function public.reactivate_account() from public, anon, authenticated;
revoke all on function public.admin_set_account_status(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.deactivate_account() to authenticated;
grant execute on function public.reactivate_account() to authenticated;
grant execute on function public.admin_set_account_status(uuid, boolean, text) to authenticated;
