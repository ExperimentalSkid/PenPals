-- Automatically derive the Active Penpal badge from the activity system's
-- existing active_day events. The event log remains the only source of truth;
-- no activity or badge counters are copied into a new table.

alter table public.profile_badge_definitions
  add column if not exists minimum_active_days integer;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'profile_badge_definitions_minimum_active_days_check'
       and conrelid = 'public.profile_badge_definitions'::regclass
  ) then
    alter table public.profile_badge_definitions
      add constraint profile_badge_definitions_minimum_active_days_check
      check (minimum_active_days is null or minimum_active_days > 0);
  end if;
end;
$$;

comment on column public.profile_badge_definitions.minimum_active_days is
  'Minimum distinct active_day dates required for an automatically derived badge grade.';

insert into public.profile_badge_definitions (
  badge_key, label, icon, tone, is_system_derived, sort_order, minimum_active_days
)
values
  ('active-penpal-bronze', 'Active Penpal · Bronze', 'calendar', 'active-penpal', true, 23, 30),
  ('active-penpal-silver', 'Active Penpal · Silver', 'calendar', 'active-penpal', true, 24, 90),
  ('active-penpal-gold', 'Active Penpal · Gold', 'calendar', 'active-penpal', true, 25, 365),
  ('active-penpal-platinum', 'Active Penpal · Platinum', 'calendar', 'active-penpal', true, 26, 730)
on conflict (badge_key) do update
  set label = excluded.label,
      icon = excluded.icon,
      tone = excluded.tone,
      is_system_derived = excluded.is_system_derived,
      sort_order = excluded.sort_order,
      minimum_active_days = excluded.minimum_active_days;

-- Count dates rather than rows so the existing active-day idempotency rule is
-- preserved even if a trusted caller retries with another event key.
create or replace function public.active_penpal_day_count(target_user uuid)
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select count(distinct e.occurred_at::date)::integer
    from public.activity_rank_events e
   where e.user_id = target_user
     and e.event_type = 'active_day';
$$;

revoke all on function public.active_penpal_day_count(uuid) from public, anon, authenticated;

-- Small threshold helper keeps boundary behavior deterministic and lets the
-- user-id wrapper remain the only path used by badge projections.
create or replace function public.active_penpal_grade_for_count(active_day_count integer)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select d.badge_key
    from public.profile_badge_definitions d
   where d.badge_key like 'active-penpal-%'
     and d.is_system_derived
     and active_day_count is not null
     and d.minimum_active_days is not null
     and active_day_count >= d.minimum_active_days
   order by d.minimum_active_days desc, d.sort_order desc
   limit 1;
$$;

revoke all on function public.active_penpal_grade_for_count(integer) from public, anon, authenticated;

create or replace function public.active_penpal_grade(target_user uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.active_penpal_grade_for_count(public.active_penpal_day_count(target_user));
$$;

revoke all on function public.active_penpal_grade(uuid) from public, anon, authenticated;

-- Extend the existing public projection with the one highest Active Penpal
-- grade while preserving all earlier derived and manual badge families.
create or replace function public.get_profile_badges(target_user uuid)
returns table (
  badge_key text,
  label text,
  icon text,
  tone text,
  is_derived boolean,
  assigned_at timestamptz
)
language plpgsql
security definer
stable
set search_path = pg_catalog, public
as $$
declare
  veteran_badge_key text;
  builder_badge_key text;
  active_badge_key text;
begin
  if target_user is null or not public.viewer_can_access_profile(target_user) then
    return;
  end if;

  select public.penpal_veteran_grade(u.created_at, now())
    into veteran_badge_key
    from auth.users u
   where u.id = target_user;

  select public.profile_builder_grade(target_user)
    into builder_badge_key;

  select public.active_penpal_grade(target_user)
    into active_badge_key;

  return query
  with available as (
    select d.badge_key, d.label, d.icon, d.tone, true as is_derived,
           null::timestamptz as assigned_at, d.sort_order
      from public.profile_badge_definitions d
     where d.badge_key = 'verified'
       and public.is_profile_verified(target_user)
    union all
    select d.badge_key, d.label, d.icon, d.tone, true,
           null::timestamptz, d.sort_order
      from public.profile_badge_definitions d
     where d.badge_key = veteran_badge_key
    union all
    select d.badge_key, d.label, d.icon, d.tone, true,
           null::timestamptz, d.sort_order
      from public.profile_badge_definitions d
     where d.badge_key = builder_badge_key
    union all
    select d.badge_key, d.label, d.icon, d.tone, true,
           null::timestamptz, d.sort_order
      from public.profile_badge_definitions d
     where d.badge_key = active_badge_key
    union all
    select d.badge_key, d.label, d.icon, d.tone, false,
           b.assigned_at, d.sort_order
      from public.profile_badges b
      join public.profile_badge_definitions d on d.badge_key = b.badge_key
     where b.user_id = target_user
       and not d.is_system_derived
  )
  select a.badge_key, a.label, a.icon, a.tone, a.is_derived, a.assigned_at
    from available a
   order by a.sort_order, a.badge_key;
end;
$$;

revoke all on function public.get_profile_badges(uuid) from public, anon;
grant execute on function public.get_profile_badges(uuid) to authenticated;

-- Staff reads the same derived grade while retaining the existing manual-badge
-- management boundary.
create or replace function public.admin_get_profile_badges(target_user uuid)
returns table (
  badge_key text,
  label text,
  icon text,
  tone text,
  is_derived boolean,
  assigned_at timestamptz
)
language plpgsql
security definer
stable
set search_path = pg_catalog, public
as $$
declare
  veteran_badge_key text;
  builder_badge_key text;
  active_badge_key text;
begin
  if not public.is_moderator() then
    raise exception 'Moderator authorization required';
  end if;
  if target_user is null or not exists (select 1 from public.profiles p where p.id = target_user) then
    raise exception 'User not found';
  end if;

  select public.penpal_veteran_grade(u.created_at, now())
    into veteran_badge_key
    from auth.users u
   where u.id = target_user;

  select public.profile_builder_grade(target_user)
    into builder_badge_key;

  select public.active_penpal_grade(target_user)
    into active_badge_key;

  return query
  with available as (
    select d.badge_key, d.label, d.icon, d.tone, true as is_derived,
           null::timestamptz as assigned_at, d.sort_order
      from public.profile_badge_definitions d
     where d.badge_key = 'verified'
       and public.is_profile_verified(target_user)
    union all
    select d.badge_key, d.label, d.icon, d.tone, true,
           null::timestamptz, d.sort_order
      from public.profile_badge_definitions d
     where d.badge_key = veteran_badge_key
    union all
    select d.badge_key, d.label, d.icon, d.tone, true,
           null::timestamptz, d.sort_order
      from public.profile_badge_definitions d
     where d.badge_key = builder_badge_key
    union all
    select d.badge_key, d.label, d.icon, d.tone, true,
           null::timestamptz, d.sort_order
      from public.profile_badge_definitions d
     where d.badge_key = active_badge_key
    union all
    select d.badge_key, d.label, d.icon, d.tone, false,
           b.assigned_at, d.sort_order
      from public.profile_badges b
      join public.profile_badge_definitions d on d.badge_key = b.badge_key
     where b.user_id = target_user
       and not d.is_system_derived
  )
  select a.badge_key, a.label, a.icon, a.tone, a.is_derived, a.assigned_at
    from available a
   order by a.sort_order, a.badge_key;
end;
$$;

revoke all on function public.admin_get_profile_badges(uuid) from public, anon;
grant execute on function public.admin_get_profile_badges(uuid) to authenticated;
