-- Automatically derive the Letter Writer badge from authoritative message
-- rows. Account deletion sets sender_id to null, so deleted identities no
-- longer contribute; moderation flags remain part of the existing message
-- record and do not create a second message count.

alter table public.profile_badge_definitions
  add column if not exists minimum_messages_sent integer;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'profile_badge_definitions_minimum_messages_sent_check'
       and conrelid = 'public.profile_badge_definitions'::regclass
  ) then
    alter table public.profile_badge_definitions
      add constraint profile_badge_definitions_minimum_messages_sent_check
      check (minimum_messages_sent is null or minimum_messages_sent > 0);
  end if;
end;
$$;

comment on column public.profile_badge_definitions.minimum_messages_sent is
  'Minimum messages sent required for an automatically derived Letter Writer grade.';

insert into public.profile_badge_definitions (
  badge_key, label, icon, tone, is_system_derived, sort_order,
  minimum_messages_sent
)
values
  ('letter-writer-bronze', 'Letter Writer · Bronze', 'people', 'letter-writer', true, 63, 100),
  ('letter-writer-silver', 'Letter Writer · Silver', 'people', 'letter-writer', true, 64, 500),
  ('letter-writer-gold', 'Letter Writer · Gold', 'people', 'letter-writer', true, 65, 2500),
  ('letter-writer-platinum', 'Letter Writer · Platinum', 'people', 'letter-writer', true, 66, 10000)
on conflict (badge_key) do update
  set label = excluded.label,
      icon = excluded.icon,
      tone = excluded.tone,
      is_system_derived = excluded.is_system_derived,
      sort_order = excluded.sort_order,
      minimum_messages_sent = excluded.minimum_messages_sent;

-- Message sender_id is the authoritative owner of each message. The account
-- deletion migration nulls that column for erased users, and moderation keeps
-- the row while changing only moderation_status, so this query follows both
-- existing semantics without counting any other user's messages.
create index if not exists messages_sender_idx
  on public.messages (sender_id);

create or replace function public.letter_writer_message_count(target_user uuid)
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select count(*)::integer
    from public.messages m
   where m.sender_id = target_user;
$$;

revoke all on function public.letter_writer_message_count(uuid) from public, anon, authenticated;

create or replace function public.letter_writer_grade_for_count(messages_sent integer)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select d.badge_key
    from public.profile_badge_definitions d
   where d.badge_key like 'letter-writer-%'
     and d.is_system_derived
     and messages_sent is not null
     and d.minimum_messages_sent is not null
     and messages_sent >= d.minimum_messages_sent
   order by d.minimum_messages_sent desc, d.sort_order desc
   limit 1;
$$;

revoke all on function public.letter_writer_grade_for_count(integer) from public, anon, authenticated;

create or replace function public.letter_writer_grade(target_user uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.letter_writer_grade_for_count(public.letter_writer_message_count(target_user));
$$;

revoke all on function public.letter_writer_grade(uuid) from public, anon, authenticated;

-- Extend the public projection with one highest Letter Writer grade while
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
