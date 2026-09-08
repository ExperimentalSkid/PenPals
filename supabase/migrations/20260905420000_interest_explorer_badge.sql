-- Automatically derive Interest Explorer from current profile interests.

alter table public.profile_badge_definitions
  add column if not exists minimum_profile_interests integer;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'profile_badge_definitions_minimum_profile_interests_check'
       and conrelid = 'public.profile_badge_definitions'::regclass
  ) then
    alter table public.profile_badge_definitions
      add constraint profile_badge_definitions_minimum_profile_interests_check
      check (minimum_profile_interests is null or minimum_profile_interests > 0);
  end if;
end;
$$;

comment on column public.profile_badge_definitions.minimum_profile_interests is
  'Minimum distinct current profile interests for an automatically derived Interest Explorer grade.';

insert into public.profile_badge_definitions (
  badge_key, label, icon, tone, is_system_derived, sort_order,
  minimum_profile_interests
)
values
  ('interest-explorer-bronze', 'Interest Explorer · Bronze', 'globe', 'language-exchange', true, 95, 5),
  ('interest-explorer-silver', 'Interest Explorer · Silver', 'globe', 'language-exchange', true, 96, 10),
  ('interest-explorer-gold', 'Interest Explorer · Gold', 'globe', 'language-exchange', true, 97, 20),
  ('interest-explorer-platinum', 'Interest Explorer · Platinum', 'globe', 'language-exchange', true, 98, 30)
on conflict (badge_key) do update
  set label = excluded.label,
      icon = excluded.icon,
      tone = excluded.tone,
      is_system_derived = excluded.is_system_derived,
      sort_order = excluded.sort_order,
      minimum_profile_interests = excluded.minimum_profile_interests;

create index if not exists profile_interests_profile_interest_idx
  on public.profile_interests (profile_id, interest_id);

create or replace function public.interest_explorer_interest_count(target_user uuid)
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select count(distinct pi.interest_id)::integer
    from public.profile_interests pi
   where pi.profile_id = target_user;
$$;

revoke all on function public.interest_explorer_interest_count(uuid) from public, anon, authenticated;

create or replace function public.interest_explorer_grade_for_count(interest_count integer)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select d.badge_key
    from public.profile_badge_definitions d
   where d.badge_key like 'interest-explorer-%'
     and d.is_system_derived
     and interest_count is not null
     and d.minimum_profile_interests is not null
     and interest_count >= d.minimum_profile_interests
   order by d.minimum_profile_interests desc, d.sort_order desc
   limit 1;
$$;

revoke all on function public.interest_explorer_grade_for_count(integer) from public, anon, authenticated;

create or replace function public.interest_explorer_grade(target_user uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.interest_explorer_grade_for_count(
    public.interest_explorer_interest_count(target_user)
  );
$$;

revoke all on function public.interest_explorer_grade(uuid) from public, anon, authenticated;

-- Extend both existing secure profile projections while preserving their
-- visibility, manual-badge, and ordering behavior.
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
begin
  if target_user is null or not public.viewer_can_access_profile(target_user) then
    return;
  end if;

  return query
  with available as (
    select p.badge_key, p.label, p.icon, p.tone, p.is_derived, p.assigned_at
      from public.profile_badge_projection(target_user, true) p
    union all
    select d.badge_key, d.label, d.icon, d.tone, true, null::timestamptz
      from public.profile_badge_definitions d
     where d.badge_key = public.language_learner_grade(target_user)
    union all
    select d.badge_key, d.label, d.icon, d.tone, true, null::timestamptz
      from public.profile_badge_definitions d
     where d.badge_key = public.interest_explorer_grade(target_user)
  )
  select a.badge_key, a.label, a.icon, a.tone, a.is_derived, a.assigned_at
    from available a
    join public.profile_badge_definitions d on d.badge_key = a.badge_key
   order by d.sort_order, a.badge_key;
end;
$$;

revoke all on function public.get_profile_badges(uuid) from public, anon;
grant execute on function public.get_profile_badges(uuid) to authenticated;

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
begin
  if not public.is_moderator() then
    raise exception 'Moderator authorization required';
  end if;
  if target_user is null or not exists (select 1 from public.profiles p where p.id = target_user) then
    raise exception 'User not found';
  end if;

  return query
  with available as (
    select p.badge_key, p.label, p.icon, p.tone, p.is_derived, p.assigned_at
      from public.profile_badge_projection(target_user, true) p
    union all
    select d.badge_key, d.label, d.icon, d.tone, true, null::timestamptz
      from public.profile_badge_definitions d
     where d.badge_key = public.language_learner_grade(target_user)
    union all
    select d.badge_key, d.label, d.icon, d.tone, true, null::timestamptz
      from public.profile_badge_definitions d
     where d.badge_key = public.interest_explorer_grade(target_user)
  )
  select a.badge_key, a.label, a.icon, a.tone, a.is_derived, a.assigned_at
    from available a
    join public.profile_badge_definitions d on d.badge_key = a.badge_key
   order by d.sort_order, a.badge_key;
end;
$$;

revoke all on function public.admin_get_profile_badges(uuid) from public, anon;
grant execute on function public.admin_get_profile_badges(uuid) to authenticated;
