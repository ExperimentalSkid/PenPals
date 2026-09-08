-- Automatically derive the Connector badge from the existing conversation
-- membership rows. A contact is a distinct other participant, not a message
-- or conversation count, and no badge assignment rows are created.

alter table public.profile_badge_definitions
  add column if not exists minimum_unique_contacts integer;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'profile_badge_definitions_minimum_unique_contacts_check'
       and conrelid = 'public.profile_badge_definitions'::regclass
  ) then
    alter table public.profile_badge_definitions
      add constraint profile_badge_definitions_minimum_unique_contacts_check
      check (minimum_unique_contacts is null or minimum_unique_contacts > 0);
  end if;
end;
$$;

comment on column public.profile_badge_definitions.minimum_unique_contacts is
  'Minimum distinct conversation contacts required for an automatically derived Connector grade.';

insert into public.profile_badge_definitions (
  badge_key, label, icon, tone, is_system_derived, sort_order,
  minimum_unique_contacts
)
values
  ('connector-bronze', 'Connector · Bronze', 'people', 'connector', true, 35, 25),
  ('connector-silver', 'Connector · Silver', 'people', 'connector', true, 36, 75),
  ('connector-gold', 'Connector · Gold', 'people', 'connector', true, 37, 150),
  ('connector-platinum', 'Connector · Platinum', 'people', 'connector', true, 38, 300)
on conflict (badge_key) do update
  set label = excluded.label,
      icon = excluded.icon,
      tone = excluded.tone,
      is_system_derived = excluded.is_system_derived,
      sort_order = excluded.sort_order,
      minimum_unique_contacts = excluded.minimum_unique_contacts;

-- The participant primary key starts with conversation_id. This companion
-- index makes the target-user lookup efficient before joining each conversation
-- back to its other participants.
create index if not exists conversation_participants_user_idx
  on public.conversation_participants (user_id, conversation_id);

create or replace function public.connector_unique_contact_count(target_user uuid)
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select count(distinct other_participant.user_id)::integer
    from public.conversation_participants own_participant
    join public.conversation_participants other_participant
      on other_participant.conversation_id = own_participant.conversation_id
     and other_participant.user_id <> target_user
   where own_participant.user_id = target_user;
$$;

revoke all on function public.connector_unique_contact_count(uuid) from public, anon, authenticated;

create or replace function public.connector_grade_for_count(unique_contact_count integer)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select d.badge_key
    from public.profile_badge_definitions d
   where d.badge_key like 'connector-%'
     and d.is_system_derived
     and unique_contact_count is not null
     and d.minimum_unique_contacts is not null
     and unique_contact_count >= d.minimum_unique_contacts
   order by d.minimum_unique_contacts desc, d.sort_order desc
   limit 1;
$$;

revoke all on function public.connector_grade_for_count(integer) from public, anon, authenticated;

create or replace function public.connector_grade(target_user uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.connector_grade_for_count(public.connector_unique_contact_count(target_user));
$$;

revoke all on function public.connector_grade(uuid) from public, anon, authenticated;

-- Extend the existing public projection with the one highest Connector grade
-- while preserving all previous derived and manual badge families.
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
  connector_badge_key text;
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

  select public.connector_grade(target_user)
    into connector_badge_key;

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
    select d.badge_key, d.label, d.icon, d.tone, true,
           null::timestamptz, d.sort_order
      from public.profile_badge_definitions d
     where d.badge_key = connector_badge_key
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
  connector_badge_key text;
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

  select public.connector_grade(target_user)
    into connector_badge_key;

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
    select d.badge_key, d.label, d.icon, d.tone, true,
           null::timestamptz, d.sort_order
      from public.profile_badge_definitions d
     where d.badge_key = connector_badge_key
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
