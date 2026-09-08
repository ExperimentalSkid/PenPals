-- Automatically derive Mystery Explorer from actual Mystery Pick selections.
-- Exposures without a selected card do not contribute to this badge.

alter table public.profile_badge_definitions
  add column if not exists minimum_mystery_selections integer;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'profile_badge_definitions_minimum_mystery_selections_check'
       and conrelid = 'public.profile_badge_definitions'::regclass
  ) then
    alter table public.profile_badge_definitions
      add constraint profile_badge_definitions_minimum_mystery_selections_check
      check (minimum_mystery_selections is null or minimum_mystery_selections > 0);
  end if;
end;
$$;

comment on column public.profile_badge_definitions.minimum_mystery_selections is
  'Minimum Mystery Pick cards selected by the user for an automatically derived Mystery Explorer grade.';

insert into public.profile_badge_definitions (
  badge_key, label, icon, tone, is_system_derived, sort_order,
  minimum_mystery_selections
)
values
  ('mystery-explorer-bronze', 'Mystery Explorer · Bronze', 'globe', 'mystery-explorer', true, 71, 10),
  ('mystery-explorer-silver', 'Mystery Explorer · Silver', 'globe', 'mystery-explorer', true, 72, 50),
  ('mystery-explorer-gold', 'Mystery Explorer · Gold', 'globe', 'mystery-explorer', true, 73, 200),
  ('mystery-explorer-platinum', 'Mystery Explorer · Platinum', 'globe', 'mystery-explorer', true, 74, 500)
on conflict (badge_key) do update
  set label = excluded.label,
      icon = excluded.icon,
      tone = excluded.tone,
      is_system_derived = excluded.is_system_derived,
      sort_order = excluded.sort_order,
      minimum_mystery_selections = excluded.minimum_mystery_selections;

create index if not exists mystery_pick_cards_selected_idx
  on public.mystery_pick_cards (viewer_id, selected_at desc)
  where selected_at is not null;

create or replace function public.mystery_explorer_selection_count(target_user uuid)
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select count(distinct c.id)::integer
    from public.mystery_pick_cards c
   where c.viewer_id = target_user
     and c.selected_at is not null;
$$;

revoke all on function public.mystery_explorer_selection_count(uuid) from public, anon, authenticated;

create or replace function public.mystery_explorer_grade_for_count(selection_count integer)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select d.badge_key
    from public.profile_badge_definitions d
   where d.badge_key like 'mystery-explorer-%'
     and d.is_system_derived
     and selection_count is not null
     and d.minimum_mystery_selections is not null
     and selection_count >= d.minimum_mystery_selections
   order by d.minimum_mystery_selections desc, d.sort_order desc
   limit 1;
$$;

revoke all on function public.mystery_explorer_grade_for_count(integer) from public, anon, authenticated;

create or replace function public.mystery_explorer_grade(target_user uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.mystery_explorer_grade_for_count(public.mystery_explorer_selection_count(target_user));
$$;

revoke all on function public.mystery_explorer_grade(uuid) from public, anon, authenticated;

-- Extend the public projection with one highest Mystery Explorer grade while
-- preserving Verified, all previous derived families, and manual badges.
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
  quick_replier_badge_key text;
  icebreaker_badge_key text;
  conversation_starter_badge_key text;
  letter_writer_badge_key text;
  steady_penpal_badge_key text;
  mystery_explorer_badge_key text;
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
  select public.quick_replier_grade(target_user) into quick_replier_badge_key;
  select public.icebreaker_grade(target_user) into icebreaker_badge_key;
  select public.conversation_starter_grade(target_user) into conversation_starter_badge_key;
  select public.letter_writer_grade(target_user) into letter_writer_badge_key;
  select public.steady_penpal_grade(target_user) into steady_penpal_badge_key;
  select public.mystery_explorer_grade(target_user) into mystery_explorer_badge_key;

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
    select d.badge_key, d.label, d.icon, d.tone, true, null::timestamptz, d.sort_order
      from public.profile_badge_definitions d where d.badge_key = quick_replier_badge_key
    union all
    select d.badge_key, d.label, d.icon, d.tone, true, null::timestamptz, d.sort_order
      from public.profile_badge_definitions d where d.badge_key = icebreaker_badge_key
    union all
    select d.badge_key, d.label, d.icon, d.tone, true, null::timestamptz, d.sort_order
      from public.profile_badge_definitions d where d.badge_key = conversation_starter_badge_key
    union all
    select d.badge_key, d.label, d.icon, d.tone, true, null::timestamptz, d.sort_order
      from public.profile_badge_definitions d where d.badge_key = letter_writer_badge_key
    union all
    select d.badge_key, d.label, d.icon, d.tone, true, null::timestamptz, d.sort_order
      from public.profile_badge_definitions d where d.badge_key = steady_penpal_badge_key
    union all
    select d.badge_key, d.label, d.icon, d.tone, true, null::timestamptz, d.sort_order
      from public.profile_badge_definitions d where d.badge_key = mystery_explorer_badge_key
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
  quick_replier_badge_key text;
  icebreaker_badge_key text;
  conversation_starter_badge_key text;
  letter_writer_badge_key text;
  steady_penpal_badge_key text;
  mystery_explorer_badge_key text;
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
  select public.quick_replier_grade(target_user) into quick_replier_badge_key;
  select public.icebreaker_grade(target_user) into icebreaker_badge_key;
  select public.conversation_starter_grade(target_user) into conversation_starter_badge_key;
  select public.letter_writer_grade(target_user) into letter_writer_badge_key;
  select public.steady_penpal_grade(target_user) into steady_penpal_badge_key;
  select public.mystery_explorer_grade(target_user) into mystery_explorer_badge_key;

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
    select d.badge_key, d.label, d.icon, d.tone, true, null::timestamptz, d.sort_order
      from public.profile_badge_definitions d where d.badge_key = quick_replier_badge_key
    union all
    select d.badge_key, d.label, d.icon, d.tone, true, null::timestamptz, d.sort_order
      from public.profile_badge_definitions d where d.badge_key = icebreaker_badge_key
    union all
    select d.badge_key, d.label, d.icon, d.tone, true, null::timestamptz, d.sort_order
      from public.profile_badge_definitions d where d.badge_key = conversation_starter_badge_key
    union all
    select d.badge_key, d.label, d.icon, d.tone, true, null::timestamptz, d.sort_order
      from public.profile_badge_definitions d where d.badge_key = letter_writer_badge_key
    union all
    select d.badge_key, d.label, d.icon, d.tone, true, null::timestamptz, d.sort_order
      from public.profile_badge_definitions d where d.badge_key = steady_penpal_badge_key
    union all
    select d.badge_key, d.label, d.icon, d.tone, true, null::timestamptz, d.sort_order
      from public.profile_badge_definitions d where d.badge_key = mystery_explorer_badge_key
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
