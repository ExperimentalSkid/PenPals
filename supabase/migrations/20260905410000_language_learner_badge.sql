-- Automatically derive Language Learner from current profile language rows.
-- Only distinct languages with the learning purpose qualify.

alter table public.profile_badge_definitions
  add column if not exists minimum_learning_languages integer;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'profile_badge_definitions_minimum_learning_languages_check'
       and conrelid = 'public.profile_badge_definitions'::regclass
  ) then
    alter table public.profile_badge_definitions
      add constraint profile_badge_definitions_minimum_learning_languages_check
      check (minimum_learning_languages is null or minimum_learning_languages > 0);
  end if;
end;
$$;

comment on column public.profile_badge_definitions.minimum_learning_languages is
  'Minimum distinct current profile languages marked learning for an automatically derived Language Learner grade.';

insert into public.profile_badge_definitions (
  badge_key, label, icon, tone, is_system_derived, sort_order,
  minimum_learning_languages
)
values
  ('language-learner-bronze', 'Language Learner · Bronze', 'globe', 'language-exchange', true, 91, 1),
  ('language-learner-silver', 'Language Learner · Silver', 'globe', 'language-exchange', true, 92, 2),
  ('language-learner-gold', 'Language Learner · Gold', 'globe', 'language-exchange', true, 93, 3),
  ('language-learner-platinum', 'Language Learner · Platinum', 'globe', 'language-exchange', true, 94, 4)
on conflict (badge_key) do update
  set label = excluded.label,
      icon = excluded.icon,
      tone = excluded.tone,
      is_system_derived = excluded.is_system_derived,
      sort_order = excluded.sort_order,
      minimum_learning_languages = excluded.minimum_learning_languages;

create index if not exists profile_languages_learning_count_idx
  on public.profile_languages (profile_id, purpose, language_id);

create or replace function public.language_learner_language_count(target_user uuid)
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select count(distinct pl.language_id)::integer
    from public.profile_languages pl
   where pl.profile_id = target_user
     and pl.purpose = 'learning';
$$;

revoke all on function public.language_learner_language_count(uuid) from public, anon, authenticated;

create or replace function public.language_learner_grade_for_count(learning_language_count integer)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select d.badge_key
    from public.profile_badge_definitions d
   where d.badge_key like 'language-learner-%'
     and d.is_system_derived
     and learning_language_count is not null
     and d.minimum_learning_languages is not null
     and learning_language_count >= d.minimum_learning_languages
   order by d.minimum_learning_languages desc, d.sort_order desc
   limit 1;
$$;

revoke all on function public.language_learner_grade_for_count(integer) from public, anon, authenticated;

create or replace function public.language_learner_grade(target_user uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.language_learner_grade_for_count(
    public.language_learner_language_count(target_user)
  );
$$;

revoke all on function public.language_learner_grade(uuid) from public, anon, authenticated;

-- Add the derived grade to both existing secure profile projections while
-- retaining the shared projection's visibility, manual-badge, and ordering
-- behavior.
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
  )
  select a.badge_key, a.label, a.icon, a.tone, a.is_derived, a.assigned_at
    from available a
    join public.profile_badge_definitions d on d.badge_key = a.badge_key
   order by d.sort_order, a.badge_key;
end;
$$;

revoke all on function public.admin_get_profile_badges(uuid) from public, anon;
grant execute on function public.admin_get_profile_badges(uuid) to authenticated;
