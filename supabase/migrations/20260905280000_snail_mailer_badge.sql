-- Automatically derive the Snail Mailer badge from delivered letters sent by
-- the profile. A delivered letter is the durable Snail Mail lifecycle point;
-- recipient_read_at is a later state and therefore cannot inflate the count.
-- Cancelled letters are explicitly excluded even though the lifecycle guards
-- prevent cancellation after delivery.

alter table public.profile_badge_definitions
  add column if not exists minimum_delivered_letters integer;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'profile_badge_definitions_minimum_delivered_letters_check'
       and conrelid = 'public.profile_badge_definitions'::regclass
  ) then
    alter table public.profile_badge_definitions
      add constraint profile_badge_definitions_minimum_delivered_letters_check
      check (minimum_delivered_letters is null or minimum_delivered_letters > 0);
  end if;
end;
$$;

comment on column public.profile_badge_definitions.minimum_delivered_letters is
  'Minimum unique delivered Snail Mail letters sent by the user for an automatically derived Snail Mailer grade.';

insert into public.profile_badge_definitions (
  badge_key, label, icon, tone, is_system_derived, sort_order,
  minimum_delivered_letters
)
values
  ('snail-mailer-bronze', 'Snail Mailer · Bronze', 'heart', 'snail-mailer', true, 39, 15),
  ('snail-mailer-silver', 'Snail Mailer · Silver', 'heart', 'snail-mailer', true, 40, 30),
  ('snail-mailer-gold', 'Snail Mailer · Gold', 'heart', 'snail-mailer', true, 41, 100),
  ('snail-mailer-platinum', 'Snail Mailer · Platinum', 'heart', 'snail-mailer', true, 42, 250)
on conflict (badge_key) do update
  set label = excluded.label,
      icon = excluded.icon,
      tone = excluded.tone,
      is_system_derived = excluded.is_system_derived,
      sort_order = excluded.sort_order,
      minimum_delivered_letters = excluded.minimum_delivered_letters;

-- Profile projections filter on sender and the terminal delivery state. The
-- partial index avoids scanning in-transit and cancelled letters.
create index if not exists snail_mail_sender_delivered_idx
  on public.snail_mail_letters (sender_id, delivered_at)
  where delivered_at is not null and cancelled_at is null;

create or replace function public.snail_mailer_delivered_letter_count(target_user uuid)
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select count(distinct l.id)::integer
    from public.snail_mail_letters l
   where l.sender_id = target_user
     and l.delivered_at is not null
     and l.cancelled_at is null;
$$;

revoke all on function public.snail_mailer_delivered_letter_count(uuid) from public, anon, authenticated;

create or replace function public.snail_mailer_grade_for_count(delivered_letter_count integer)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select d.badge_key
    from public.profile_badge_definitions d
   where d.badge_key like 'snail-mailer-%'
     and d.is_system_derived
     and delivered_letter_count is not null
     and d.minimum_delivered_letters is not null
     and delivered_letter_count >= d.minimum_delivered_letters
   order by d.minimum_delivered_letters desc, d.sort_order desc
   limit 1;
$$;

revoke all on function public.snail_mailer_grade_for_count(integer) from public, anon, authenticated;

create or replace function public.snail_mailer_grade(target_user uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.snail_mailer_grade_for_count(public.snail_mailer_delivered_letter_count(target_user));
$$;

revoke all on function public.snail_mailer_grade(uuid) from public, anon, authenticated;

-- Extend the existing public projection with one highest Snail Mailer grade,
-- preserving every earlier derived family and manual-badge behavior.
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
  snail_mailer_badge_key text;
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

  select public.snail_mailer_grade(target_user)
    into snail_mailer_badge_key;

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
    select d.badge_key, d.label, d.icon, d.tone, true,
           null::timestamptz, d.sort_order
      from public.profile_badge_definitions d
     where d.badge_key = snail_mailer_badge_key
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
  snail_mailer_badge_key text;
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

  select public.snail_mailer_grade(target_user)
    into snail_mailer_badge_key;

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
    select d.badge_key, d.label, d.icon, d.tone, true,
           null::timestamptz, d.sort_order
      from public.profile_badge_definitions d
     where d.badge_key = snail_mailer_badge_key
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
