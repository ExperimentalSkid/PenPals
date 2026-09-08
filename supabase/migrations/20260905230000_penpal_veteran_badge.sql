-- Automatically derive the Penpal Veteran badge from the Auth account age.
-- Account tenure is intentionally kept in the central badge definitions table
-- so the grade thresholds remain data-driven and easy to tune in one place.

alter table public.profile_badge_definitions
  add column if not exists minimum_tenure interval;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'profile_badge_definitions_minimum_tenure_check'
       and conrelid = 'public.profile_badge_definitions'::regclass
  ) then
    alter table public.profile_badge_definitions
      add constraint profile_badge_definitions_minimum_tenure_check
      check (minimum_tenure is null or minimum_tenure > interval '0 seconds');
  end if;
end;
$$;

comment on column public.profile_badge_definitions.minimum_tenure is
  'Minimum Auth account tenure required for an automatically derived badge; null for badges without a tenure rule.';

insert into public.profile_badge_definitions (
  badge_key, label, icon, tone, is_system_derived, sort_order, minimum_tenure
)
values
  ('penpal-veteran-bronze', 'Penpal Veteran · Bronze', 'star', 'penpal-veteran', true, 15, interval '3 months'),
  ('penpal-veteran-silver', 'Penpal Veteran · Silver', 'star', 'penpal-veteran', true, 16, interval '6 months'),
  ('penpal-veteran-gold', 'Penpal Veteran · Gold', 'star', 'penpal-veteran', true, 17, interval '1 year'),
  ('penpal-veteran-platinum', 'Penpal Veteran · Platinum', 'star', 'penpal-veteran', true, 18, interval '3 years')
on conflict (badge_key) do update
  set label = excluded.label,
      icon = excluded.icon,
      tone = excluded.tone,
      is_system_derived = excluded.is_system_derived,
      sort_order = excluded.sort_order,
      minimum_tenure = excluded.minimum_tenure;

-- This helper is not granted to clients. The public badge projection invokes
-- it under its existing security-definer boundary, while its as-of argument
-- keeps the calendar-month thresholds deterministic for database tests.
create or replace function public.penpal_veteran_grade(
  account_created_at timestamptz,
  as_of timestamptz default now()
)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select d.badge_key
    from public.profile_badge_definitions d
   where d.badge_key like 'penpal-veteran-%'
     and d.is_system_derived
     and d.minimum_tenure is not null
     and account_created_at is not null
     and as_of is not null
     and account_created_at <= as_of - d.minimum_tenure
   order by d.minimum_tenure desc
   limit 1;
$$;

revoke all on function public.penpal_veteran_grade(timestamptz, timestamptz) from public, anon, authenticated;

-- Keep the public projection unchanged for existing badges while adding the
-- single highest veteran grade derived from auth.users.created_at.
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
begin
  if target_user is null or not public.viewer_can_access_profile(target_user) then
    return;
  end if;

  select public.penpal_veteran_grade(u.created_at, now())
    into veteran_badge_key
    from auth.users u
   where u.id = target_user;

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

-- Staff sees the same derived grade while retaining the existing manual-badge
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
