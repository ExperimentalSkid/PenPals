-- Automatically derive the graded Early Member badge from the official
-- Pen-Pals.net launch window and the Auth account creation timestamp.
-- The existing ungraded `early-member` definition remains manual for backwards
-- compatibility; graded definitions use distinct system-derived keys.

alter table public.profile_badge_definitions
  add column if not exists maximum_launch_age interval;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'profile_badge_definitions_maximum_launch_age_check'
       and conrelid = 'public.profile_badge_definitions'::regclass
  ) then
    alter table public.profile_badge_definitions
      add constraint profile_badge_definitions_maximum_launch_age_check
      check (maximum_launch_age is null or maximum_launch_age > interval '0 seconds');
  end if;
end;
$$;

comment on column public.profile_badge_definitions.maximum_launch_age is
  'Maximum time after the official launch for an automatically derived Early Member grade.';

-- This is the single launch anchor used by every Early Member calculation.
-- It is kept in a private helper so callers cannot supply a different launch
-- date when the real profile projection evaluates a badge.
create or replace function public.penpals_official_launch_at()
returns timestamptz
language sql
immutable
security definer
set search_path = pg_catalog, public
as $$
  select timestamptz '2026-09-01 00:00:00+00';
$$;

revoke all on function public.penpals_official_launch_at() from public, anon, authenticated;

insert into public.profile_badge_definitions (
  badge_key, label, icon, tone, is_system_derived, sort_order,
  maximum_launch_age
)
values
  ('early-member-bronze', 'Early Member · Bronze', 'star', 'early-member', true, 43, interval '12 months'),
  ('early-member-silver', 'Early Member · Silver', 'star', 'early-member', true, 44, interval '6 months'),
  ('early-member-gold', 'Early Member · Gold', 'star', 'early-member', true, 45, interval '3 months'),
  ('early-member-platinum', 'Early Member · Platinum', 'star', 'early-member', true, 46, interval '30 days')
on conflict (badge_key) do update
  set label = excluded.label,
      icon = excluded.icon,
      tone = excluded.tone,
      is_system_derived = excluded.is_system_derived,
      sort_order = excluded.sort_order,
      maximum_launch_age = excluded.maximum_launch_age;

-- The optional launch argument keeps boundary tests deterministic. The real
-- user-facing wrapper always uses the centralized official launch timestamp.
create or replace function public.early_member_grade_for_created_at(
  account_created_at timestamptz,
  launch_at timestamptz default public.penpals_official_launch_at()
)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select d.badge_key
    from public.profile_badge_definitions d
   where d.badge_key like 'early-member-%'
     and d.is_system_derived
     and d.maximum_launch_age is not null
     and account_created_at is not null
     and launch_at is not null
     and account_created_at >= launch_at
     and account_created_at <= launch_at + d.maximum_launch_age
   order by d.maximum_launch_age asc, d.sort_order asc
   limit 1;
$$;

revoke all on function public.early_member_grade_for_created_at(timestamptz, timestamptz) from public, anon, authenticated;

create or replace function public.early_member_grade(target_user uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.early_member_grade_for_created_at(u.created_at)
    from auth.users u
   where u.id = target_user;
$$;

revoke all on function public.early_member_grade(uuid) from public, anon, authenticated;

-- Extend the public projection with one highest Early Member grade while
-- preserving Verified, all prior automatic families, and manual badges.
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
  early_member_badge_key text;
  veteran_badge_key text;
  builder_badge_key text;
  active_badge_key text;
  correspondent_badge_key text;
  connector_badge_key text;
  snail_mailer_badge_key text;
  reliable_replier_badge_key text;
begin
  if target_user is null or not public.viewer_can_access_profile(target_user) then
    return;
  end if;

  select public.early_member_grade(target_user) into early_member_badge_key;
  select public.penpal_veteran_grade(u.created_at, now()) into veteran_badge_key
    from auth.users u where u.id = target_user;
  select public.profile_builder_grade(target_user) into builder_badge_key;
  select public.active_penpal_grade(target_user) into active_badge_key;
  select public.correspondent_grade(target_user) into correspondent_badge_key;
  select public.connector_grade(target_user) into connector_badge_key;
  select public.snail_mailer_grade(target_user) into snail_mailer_badge_key;
  select public.reliable_replier_grade(target_user) into reliable_replier_badge_key;

  return query
  with available as (
    select d.badge_key, d.label, d.icon, d.tone, true as is_derived, null::timestamptz as assigned_at, d.sort_order
      from public.profile_badge_definitions d
     where d.badge_key = 'verified' and public.is_profile_verified(target_user)
    union all
    select d.badge_key, d.label, d.icon, d.tone, true, null::timestamptz, d.sort_order
      from public.profile_badge_definitions d where d.badge_key = early_member_badge_key
    union all
    select d.badge_key, d.label, d.icon, d.tone, true, null::timestamptz, d.sort_order
      from public.profile_badge_definitions d where d.badge_key = veteran_badge_key
    union all
    select d.badge_key, d.label, d.icon, d.tone, true, null::timestamptz, d.sort_order
      from public.profile_badge_definitions d where d.badge_key = builder_badge_key
    union all
    select d.badge_key, d.label, d.icon, d.tone, true, null::timestamptz, d.sort_order
      from public.profile_badge_definitions d where d.badge_key = active_badge_key
    union all
    select d.badge_key, d.label, d.icon, d.tone, true, null::timestamptz, d.sort_order
      from public.profile_badge_definitions d where d.badge_key = correspondent_badge_key
    union all
    select d.badge_key, d.label, d.icon, d.tone, true, null::timestamptz, d.sort_order
      from public.profile_badge_definitions d where d.badge_key = connector_badge_key
    union all
    select d.badge_key, d.label, d.icon, d.tone, true, null::timestamptz, d.sort_order
      from public.profile_badge_definitions d where d.badge_key = snail_mailer_badge_key
    union all
    select d.badge_key, d.label, d.icon, d.tone, true, null::timestamptz, d.sort_order
      from public.profile_badge_definitions d where d.badge_key = reliable_replier_badge_key
    union all
    select d.badge_key, d.label, d.icon, d.tone, false, b.assigned_at, d.sort_order
      from public.profile_badges b
      join public.profile_badge_definitions d on d.badge_key = b.badge_key
     where b.user_id = target_user and not d.is_system_derived
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
  early_member_badge_key text;
  veteran_badge_key text;
  builder_badge_key text;
  active_badge_key text;
  correspondent_badge_key text;
  connector_badge_key text;
  snail_mailer_badge_key text;
  reliable_replier_badge_key text;
begin
  if not public.is_moderator() then
    raise exception 'Moderator authorization required';
  end if;
  if target_user is null or not exists (select 1 from public.profiles p where p.id = target_user) then
    raise exception 'User not found';
  end if;

  select public.early_member_grade(target_user) into early_member_badge_key;
  select public.penpal_veteran_grade(u.created_at, now()) into veteran_badge_key
    from auth.users u where u.id = target_user;
  select public.profile_builder_grade(target_user) into builder_badge_key;
  select public.active_penpal_grade(target_user) into active_badge_key;
  select public.correspondent_grade(target_user) into correspondent_badge_key;
  select public.connector_grade(target_user) into connector_badge_key;
  select public.snail_mailer_grade(target_user) into snail_mailer_badge_key;
  select public.reliable_replier_grade(target_user) into reliable_replier_badge_key;

  return query
  with available as (
    select d.badge_key, d.label, d.icon, d.tone, true as is_derived, null::timestamptz as assigned_at, d.sort_order
      from public.profile_badge_definitions d
     where d.badge_key = 'verified' and public.is_profile_verified(target_user)
    union all
    select d.badge_key, d.label, d.icon, d.tone, true, null::timestamptz, d.sort_order
      from public.profile_badge_definitions d where d.badge_key = early_member_badge_key
    union all
    select d.badge_key, d.label, d.icon, d.tone, true, null::timestamptz, d.sort_order
      from public.profile_badge_definitions d where d.badge_key = veteran_badge_key
    union all
    select d.badge_key, d.label, d.icon, d.tone, true, null::timestamptz, d.sort_order
      from public.profile_badge_definitions d where d.badge_key = builder_badge_key
    union all
    select d.badge_key, d.label, d.icon, d.tone, true, null::timestamptz, d.sort_order
      from public.profile_badge_definitions d where d.badge_key = active_badge_key
    union all
    select d.badge_key, d.label, d.icon, d.tone, true, null::timestamptz, d.sort_order
      from public.profile_badge_definitions d where d.badge_key = correspondent_badge_key
    union all
    select d.badge_key, d.label, d.icon, d.tone, true, null::timestamptz, d.sort_order
      from public.profile_badge_definitions d where d.badge_key = connector_badge_key
    union all
    select d.badge_key, d.label, d.icon, d.tone, true, null::timestamptz, d.sort_order
      from public.profile_badge_definitions d where d.badge_key = snail_mailer_badge_key
    union all
    select d.badge_key, d.label, d.icon, d.tone, true, null::timestamptz, d.sort_order
      from public.profile_badge_definitions d where d.badge_key = reliable_replier_badge_key
    union all
    select d.badge_key, d.label, d.icon, d.tone, false, b.assigned_at, d.sort_order
      from public.profile_badges b
      join public.profile_badge_definitions d on d.badge_key = b.badge_key
     where b.user_id = target_user and not d.is_system_derived
  )
  select a.badge_key, a.label, a.icon, a.tone, a.is_derived, a.assigned_at
    from available a
   order by a.sort_order, a.badge_key;
end;
$$;

revoke all on function public.admin_get_profile_badges(uuid) from public, anon;
grant execute on function public.admin_get_profile_badges(uuid) to authenticated;
