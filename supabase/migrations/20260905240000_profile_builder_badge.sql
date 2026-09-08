-- Automatically derive the Profile Builder badge from the current profile
-- completion calculation. The completion vocabulary stays in the central
-- badge-definition table; no badge assignment rows are created for derived
-- grades.

alter table public.profile_badge_definitions
  add column if not exists minimum_completion_percent smallint;

alter table public.profile_badge_definitions
  add column if not exists requires_profile_entry boolean not null default false;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'profile_badge_definitions_minimum_completion_percent_check'
       and conrelid = 'public.profile_badge_definitions'::regclass
  ) then
    alter table public.profile_badge_definitions
      add constraint profile_badge_definitions_minimum_completion_percent_check
      check (minimum_completion_percent is null or minimum_completion_percent between 0 and 100);
  end if;
end;
$$;

comment on column public.profile_badge_definitions.minimum_completion_percent is
  'Minimum current profile completion percentage required for an automatically derived grade.';
comment on column public.profile_badge_definitions.requires_profile_entry is
  'Whether an automatically derived badge also requires the enforced minimum profile-entry predicate.';

insert into public.profile_badge_definitions (
  badge_key, label, icon, tone, is_system_derived, sort_order,
  minimum_completion_percent, requires_profile_entry
)
values
  ('profile-builder-bronze', 'Profile Builder · Bronze', 'star', 'profile-builder', true, 19, 0, true),
  ('profile-builder-silver', 'Profile Builder · Silver', 'star', 'profile-builder', true, 20, 75, false),
  ('profile-builder-gold', 'Profile Builder · Gold', 'star', 'profile-builder', true, 21, 90, false),
  ('profile-builder-platinum', 'Profile Builder · Platinum', 'star', 'profile-builder', true, 22, 100, false)
on conflict (badge_key) do update
  set label = excluded.label,
      icon = excluded.icon,
      tone = excluded.tone,
      is_system_derived = excluded.is_system_derived,
      sort_order = excluded.sort_order,
      minimum_completion_percent = excluded.minimum_completion_percent,
      requires_profile_entry = excluded.requires_profile_entry;

-- This is the same small entry predicate used by the app boundary and the
-- onboarding UI. It is kept server-side so a client cannot claim Bronze by
-- sending a completion percentage of its own.
create or replace function public.profile_entry_complete(target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce((
    select nullif(btrim(p.username), '') is not null
       and nullif(btrim(p.display_name), '') is not null
       and p.birth_date is not null
       and nullif(btrim(p.country), '') is not null
       and exists (
         select 1 from public.profile_languages pl where pl.profile_id = p.id
       )
       and (
         select count(*) from public.profile_interests pi where pi.profile_id = p.id
       ) >= 3
      from public.profiles p
     where p.id = target_user
  ), false);
$$;

revoke all on function public.profile_entry_complete(uuid) from public, anon, authenticated;

-- Keep this calculation aligned with profileCompletionProgress in the app.
-- There are ten current completion fields: identity (2), birth date, gender,
-- location, bio, quote, languages, interests, and photo. The retired
-- Looking for field is intentionally not part of this calculation.
create or replace function public.profile_completion_percent(target_user uuid)
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with profile_row as (
    select p.*,
           coalesce(
             nullif(lower(btrim(p.location_precision)), ''),
             case
               when nullif(btrim(p.region_code), '') is not null then 'region'
               when nullif(btrim(p.city), '') is not null then 'locality'
               else 'country'
             end
           ) as effective_location_precision
      from public.profiles p
     where p.id = target_user
  )
  select coalesce(
    round((
      (case when nullif(btrim(p.username), '') is not null then 1 else 0 end)
      + (case when nullif(btrim(p.display_name), '') is not null then 1 else 0 end)
      + (case when p.birth_date is not null then 1 else 0 end)
      + (case when nullif(btrim(p.gender), '') is not null then 1 else 0 end)
      + (case
           when p.effective_location_precision = 'country'
             then case when nullif(btrim(p.country), '') is not null then 1 else 0 end
           when p.effective_location_precision = 'region'
             then case when nullif(btrim(p.country), '') is not null
                         and nullif(btrim(p.region_code), '') is not null
                       then 1 else 0 end
           else case when nullif(btrim(p.country), '') is not null
                       and nullif(btrim(p.city), '') is not null
                     then 1 else 0 end
         end)
      + (case when nullif(btrim(p.bio), '') is not null then 1 else 0 end)
      + (case when nullif(btrim(p.quote), '') is not null then 1 else 0 end)
      + (case when exists (
           select 1 from public.profile_languages pl where pl.profile_id = p.id
         ) then 1 else 0 end)
      + (case when (
           select count(*) from public.profile_interests pi where pi.profile_id = p.id
         ) >= 3 then 1 else 0 end)
      + (case when nullif(btrim(p.avatar_path), '') is not null then 1 else 0 end)
    )::numeric / 10 * 100)::integer,
    0
  )
    from profile_row p;
$$;

revoke all on function public.profile_completion_percent(uuid) from public, anon, authenticated;

-- Small pure helper used by the user-facing projection and by deterministic
-- boundary tests. Bronze has a predicate in addition to its percentage value;
-- the remaining grades are driven only by the centralized thresholds.
create or replace function public.profile_builder_grade_for_values(
  entry_complete boolean,
  completion_percent integer
)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select d.badge_key
    from public.profile_badge_definitions d
   where d.badge_key like 'profile-builder-%'
     and d.is_system_derived
     and (
       (d.requires_profile_entry and entry_complete)
       or (
         not d.requires_profile_entry
         and completion_percent is not null
         and d.minimum_completion_percent is not null
         and completion_percent >= d.minimum_completion_percent
       )
     )
   order by coalesce(d.minimum_completion_percent, -1) desc, d.sort_order desc
   limit 1;
$$;

revoke all on function public.profile_builder_grade_for_values(boolean, integer) from public, anon, authenticated;

create or replace function public.profile_builder_grade(target_user uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.profile_builder_grade_for_values(
    public.profile_entry_complete(target_user),
    public.profile_completion_percent(target_user)
  );
$$;

revoke all on function public.profile_builder_grade(uuid) from public, anon, authenticated;

-- Extend the existing public projection with the one highest Profile Builder
-- grade while preserving Verified, Penpal Veteran, and manual badges.
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
