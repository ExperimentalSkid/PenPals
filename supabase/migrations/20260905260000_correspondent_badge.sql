-- Automatically derive the Correspondent badge from successful outgoing
-- introductions. In the current introduction lifecycle, a `replied` status
-- is the server-authoritative acceptance transition (the recipient's reply
-- creates the conversation). No separate badge assignment rows are created.

alter table public.profile_badge_definitions
  add column if not exists minimum_successful_outgoing integer;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'profile_badge_definitions_minimum_successful_outgoing_check'
       and conrelid = 'public.profile_badge_definitions'::regclass
  ) then
    alter table public.profile_badge_definitions
      add constraint profile_badge_definitions_minimum_successful_outgoing_check
      check (minimum_successful_outgoing is null or minimum_successful_outgoing > 0);
  end if;
end;
$$;

comment on column public.profile_badge_definitions.minimum_successful_outgoing is
  'Minimum distinct successful outgoing introductions/conversations required for an automatically derived Correspondent grade.';

insert into public.profile_badge_definitions (
  badge_key, label, icon, tone, is_system_derived, sort_order,
  minimum_successful_outgoing
)
values
  ('correspondent-bronze', 'Correspondent · Bronze', 'people', 'correspondent', true, 27, 10),
  ('correspondent-silver', 'Correspondent · Silver', 'people', 'correspondent', true, 28, 30),
  ('correspondent-gold', 'Correspondent · Gold', 'people', 'correspondent', true, 29, 150),
  ('correspondent-platinum', 'Correspondent · Platinum', 'people', 'correspondent', true, 30, 500)
on conflict (badge_key) do update
  set label = excluded.label,
      icon = excluded.icon,
      tone = excluded.tone,
      is_system_derived = excluded.is_system_derived,
      sort_order = excluded.sort_order,
      minimum_successful_outgoing = excluded.minimum_successful_outgoing;

-- Correspondent reads introductions by sender and lifecycle status. Keep this
-- index aligned with the predicate so profile projections do not scan the
-- entire introduction history for every profile view.
create index if not exists introductions_sender_status_idx
  on public.conversation_introductions (sender_id, status, created_at desc);

-- `replied` is the only accepted state in the current schema; `accepted` is
-- included for compatibility if the lifecycle gains an explicit acceptance
-- label later. Distinct conversation ids prevent duplicate lifecycle rows for
-- one conversation from inflating the metric; legacy rows without a
-- conversation id remain distinct by their introduction id.
create or replace function public.correspondent_successful_outgoing_count(target_user uuid)
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select count(distinct coalesce(i.conversation_id_legacy, i.id))::integer
   from public.conversation_introductions i
   where i.sender_id = target_user
     and i.status in ('accepted', 'replied');
$$;

revoke all on function public.correspondent_successful_outgoing_count(uuid) from public, anon, authenticated;

create or replace function public.correspondent_grade_for_count(successful_outgoing_count integer)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select d.badge_key
    from public.profile_badge_definitions d
   where d.badge_key like 'correspondent-%'
     and d.is_system_derived
     and successful_outgoing_count is not null
     and d.minimum_successful_outgoing is not null
     and successful_outgoing_count >= d.minimum_successful_outgoing
   order by d.minimum_successful_outgoing desc, d.sort_order desc
   limit 1;
$$;

revoke all on function public.correspondent_grade_for_count(integer) from public, anon, authenticated;

create or replace function public.correspondent_grade(target_user uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.correspondent_grade_for_count(public.correspondent_successful_outgoing_count(target_user));
$$;

revoke all on function public.correspondent_grade(uuid) from public, anon, authenticated;

-- Extend the existing public projection with the one highest Correspondent
-- grade while preserving Verified, Veteran, Profile Builder, Active Penpal,
-- and manual badge behavior.
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
  correspondent_badge_key text;
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

  select public.correspondent_grade(target_user)
    into correspondent_badge_key;

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
    select d.badge_key, d.label, d.icon, d.tone, true,
           null::timestamptz, d.sort_order
      from public.profile_badge_definitions d
     where d.badge_key = correspondent_badge_key
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
  correspondent_badge_key text;
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

  select public.correspondent_grade(target_user)
    into correspondent_badge_key;

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
    select d.badge_key, d.label, d.icon, d.tone, true,
           null::timestamptz, d.sort_order
      from public.profile_badge_definitions d
     where d.badge_key = correspondent_badge_key
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
