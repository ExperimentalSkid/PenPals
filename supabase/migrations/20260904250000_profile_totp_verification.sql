-- Profile verification backed by a Supabase Auth TOTP factor.
-- Auth stores the factor secret; Penpal stores only the factor id and the
-- server-controlled badge timing state.

create table if not exists public.profile_totp_verifications (
  user_id uuid primary key references auth.users(id) on delete cascade,
  factor_id uuid not null,
  verified_at timestamptz not null,
  reverify_after timestamptz not null,
  grace_until timestamptz not null,
  inactive_started_at timestamptz,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (reverify_after > verified_at),
  check (grace_until > reverify_after),
  check (inactive_started_at is null or inactive_started_at <= now())
);

comment on table public.profile_totp_verifications is
  'Private profile badge timing for a verified Supabase Auth TOTP factor. TOTP secrets remain in Auth.';

alter table public.profile_totp_verifications enable row level security;
revoke all on table public.profile_totp_verifications from public, anon, authenticated;

drop trigger if exists profile_totp_verifications_updated_at on public.profile_totp_verifications;
create trigger profile_totp_verifications_updated_at
before update on public.profile_totp_verifications
for each row execute function public.set_updated_at();

-- A paused profile stops the verification clock. On resume, move both
-- deadlines forward by the exact paused duration.
create or replace function public.profile_totp_inactive_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  paused_at timestamptz;
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
      update public.profile_totp_verifications
         set reverify_after = reverify_after + greatest(interval '0 seconds', now() - paused_at),
             grace_until = grace_until + greatest(interval '0 seconds', now() - paused_at),
             inactive_started_at = null,
             updated_at = now()
       where user_id = new.id;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.profile_totp_inactive_lifecycle() from public, anon, authenticated;

drop trigger if exists profiles_profile_totp_lifecycle on public.profiles;
create trigger profiles_profile_totp_lifecycle
after update of inactive_mode on public.profiles
for each row execute function public.profile_totp_inactive_lifecycle();

-- Public callers receive only the existing boolean badge projection. The
-- seven-day grace period deliberately keeps that boolean true.
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
       and now() < t.grace_until
  );
$$;

revoke all on function public.is_profile_verified(uuid) from public, anon, authenticated;

-- Self-only status for the Settings verification module. The factor id is
-- useful to match an already enrolled Auth factor and is never public.
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
  state text;
begin
  if me is null then raise exception 'Authentication required'; end if;

  select inactive_mode into inactive from public.profiles where id = me;
  select * into row_data from public.profile_totp_verifications where user_id = me;
  if not found then
    return jsonb_build_object('enrolled', false, 'state', 'not-enrolled', 'badge_visible', false);
  end if;

  if coalesce(inactive, false) then
    state := 'inactive';
  elsif now() < row_data.reverify_after then
    state := 'verified';
  elsif now() < row_data.grace_until then
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
    'badge_visible', now() < row_data.grace_until
  );
end;
$$;

revoke all on function public.get_my_profile_totp_status() from public, anon;
grant execute on function public.get_my_profile_totp_status() to authenticated;

-- The browser must first complete Supabase Auth's TOTP challenge. AAL2 and a
-- TOTP AMR entry are required here, so a forged client-side success cannot
-- renew the profile badge.
create or replace function public.complete_profile_totp_verification(p_factor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid := auth.uid();
  existing public.profile_totp_verifications%rowtype;
  profile_inactive boolean;
  verified_at_value timestamptz := now();
  next_due timestamptz := now() + interval '30 days';
  next_grace timestamptz := now() + interval '37 days';
begin
  if me is null then raise exception 'Authentication required'; end if;
  if p_factor_id is null then raise exception 'TOTP factor is required'; end if;
  if not public.is_email_verified() then raise exception 'Verified email required'; end if;
  if exists (select 1 from public.profiles where id = me and deactivated_at is not null) then
    raise exception 'Deactivated account';
  end if;
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2'
     or not exists (
       select 1
         from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) as method
        where method ->> 'method' = 'totp'
     ) then
    raise exception 'A verified TOTP challenge is required';
  end if;

  select inactive_mode into profile_inactive from public.profiles where id = me;
  select * into existing from public.profile_totp_verifications where user_id = me for update;
  if found and existing.factor_id <> p_factor_id then
    raise exception 'Use the enrolled profile verification factor';
  end if;

  if found then
    update public.profile_totp_verifications
       set verified_at = verified_at_value,
           reverify_after = next_due,
           grace_until = next_grace,
           inactive_started_at = case when coalesce(profile_inactive, false) then now() else null end,
           notified_at = null,
           updated_at = now()
     where user_id = me;
  else
    insert into public.profile_totp_verifications (
      user_id, factor_id, verified_at, reverify_after, grace_until,
      inactive_started_at
    ) values (
      me, p_factor_id, verified_at_value, next_due, next_grace,
      case when coalesce(profile_inactive, false) then now() else null end
    );
  end if;

  return jsonb_build_object('verified', true, 'reverify_after', next_due, 'grace_until', next_grace);
end;
$$;

revoke all on function public.complete_profile_totp_verification(uuid) from public, anon;
grant execute on function public.complete_profile_totp_verification(uuid) to authenticated;

-- Called from the authenticated app shell/settings page. It emits one
-- actionable item when grace begins, then marks that window as notified.
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

-- Keep the existing actionable notification stream and count in sync.
alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'new_introduction',
    'introduction_replied',
    'introduction_declined',
    'new_message',
    'photo_access_request',
    'photo_access_granted',
    'photo_access_revoked',
    'support_ticket_created',
    'support_ticket_user_reply',
    'support_ticket_public_reply',
    'support_ticket_waiting_user',
    'support_ticket_resolved',
    'support_ticket_reopened',
    'profile_verification_reverify'
  ));

create or replace function public.unread_notification_count()
returns bigint
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select case when public.is_email_verified() then count(*) else 0 end
    from public.notifications
   where user_id = auth.uid()
     and read_at is null
     and type in (
       'new_introduction',
       'introduction_replied',
       'introduction_declined',
       'photo_access_request',
       'photo_access_granted',
       'support_ticket_created',
       'support_ticket_user_reply',
       'support_ticket_public_reply',
       'support_ticket_waiting_user',
       'support_ticket_resolved',
       'support_ticket_reopened',
       'profile_verification_reverify'
     );
$$;

revoke all on function public.unread_notification_count() from public, anon, authenticated;
grant execute on function public.unread_notification_count() to authenticated;
