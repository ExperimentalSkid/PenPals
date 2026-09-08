-- Preserve the exact verification state at the moment a profile is paused.
-- A pause can extend a still-running deadline, but it must not revive a badge
-- whose grace period had already ended before the pause began.
create or replace function public.profile_totp_inactive_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  paused_at timestamptz;
  paused_duration interval;
begin
  if new.inactive_mode is not distinct from old.inactive_mode then
    return new;
  end if;

  if new.inactive_mode then
    update public.profile_totp_verifications
       set inactive_started_at = now(), updated_at = now()
     where user_id = new.id
       and inactive_started_at is null;
  else
    select inactive_started_at into paused_at
      from public.profile_totp_verifications
     where user_id = new.id
     for update;

    if paused_at is not null then
      paused_duration := greatest(interval '0 seconds', now() - paused_at);
      update public.profile_totp_verifications
         set reverify_after = case when reverify_after > paused_at then reverify_after + paused_duration else reverify_after end,
             grace_until = case when grace_until > paused_at then grace_until + paused_duration else grace_until end,
             inactive_started_at = null,
             updated_at = now()
       where user_id = new.id;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.profile_totp_inactive_lifecycle() from public, anon, authenticated;

-- While inactive, evaluate the badge at the pause instant rather than letting
-- wall-clock time hide it during the paused interval.
create or replace function public.is_profile_verified(target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
      from public.external_account_verifications v
     where v.penpal_user_id = target_user
       and v.status = 'verified'
       and v.revoked_at is null
       and (v.reverify_after is null or v.reverify_after > now())
  ) or exists (
    select 1
      from public.profile_totp_verifications t
      join public.profiles p on p.id = t.user_id
     where t.user_id = target_user
       and p.deactivated_at is null
       and (case when coalesce(p.inactive_mode, false) and t.inactive_started_at is not null
                 then t.inactive_started_at else now() end) < t.grace_until
  );
$$;

revoke all on function public.is_profile_verified(uuid) from public, anon, authenticated;

create or replace function public.get_my_profile_totp_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid := auth.uid();
  row_data public.profile_totp_verifications%rowtype;
  inactive boolean;
  effective_at timestamptz;
  state text;
begin
  if me is null then raise exception 'Authentication required'; end if;

  select inactive_mode into inactive from public.profiles where id = me;
  select * into row_data from public.profile_totp_verifications where user_id = me;
  if not found then
    return jsonb_build_object('enrolled', false, 'state', 'not-enrolled', 'badge_visible', false);
  end if;

  effective_at := case when coalesce(inactive, false) and row_data.inactive_started_at is not null
                       then row_data.inactive_started_at else now() end;
  if coalesce(inactive, false) then
    state := 'inactive';
  elsif effective_at < row_data.reverify_after then
    state := 'verified';
  elsif effective_at < row_data.grace_until then
    state := 'grace';
  else
    state := 'expired';
  end if;

  return jsonb_build_object(
    'enrolled', true,
    'factor_id', row_data.factor_id,
    'verified_at', row_data.verified_at,
    'reverify_after', row_data.reverify_after,
    'grace_until', row_data.grace_until,
    'inactive_started_at', row_data.inactive_started_at,
    'state', state,
    'badge_visible', effective_at < row_data.grace_until
  );
end;
$$;

revoke all on function public.get_my_profile_totp_status() from public, anon;
grant execute on function public.get_my_profile_totp_status() to authenticated;
