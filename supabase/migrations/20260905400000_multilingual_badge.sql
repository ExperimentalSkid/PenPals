-- Automatically derive Multilingual from the current profile language rows.
-- A language declared for more than one purpose still counts once.

alter table public.profile_badge_definitions
  add column if not exists minimum_profile_languages integer;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'profile_badge_definitions_minimum_profile_languages_check'
       and conrelid = 'public.profile_badge_definitions'::regclass
  ) then
    alter table public.profile_badge_definitions
      add constraint profile_badge_definitions_minimum_profile_languages_check
      check (minimum_profile_languages is null or minimum_profile_languages > 0);
  end if;
end;
$$;

comment on column public.profile_badge_definitions.minimum_profile_languages is
  'Minimum distinct current profile languages for an automatically derived Multilingual grade.';

insert into public.profile_badge_definitions (
  badge_key, label, icon, tone, is_system_derived, sort_order,
  minimum_profile_languages
)
values
  ('multilingual-bronze', 'Multilingual · Bronze', 'globe', 'language-exchange', true, 87, 2),
  ('multilingual-silver', 'Multilingual · Silver', 'globe', 'language-exchange', true, 88, 3),
  ('multilingual-gold', 'Multilingual · Gold', 'globe', 'language-exchange', true, 89, 4),
  ('multilingual-platinum', 'Multilingual · Platinum', 'globe', 'language-exchange', true, 90, 5)
on conflict (badge_key) do update
  set label = excluded.label,
      icon = excluded.icon,
      tone = excluded.tone,
      is_system_derived = excluded.is_system_derived,
      sort_order = excluded.sort_order,
      minimum_profile_languages = excluded.minimum_profile_languages;

create index if not exists profile_languages_profile_language_idx
  on public.profile_languages (profile_id, language_id);

create or replace function public.multilingual_language_count(target_user uuid)
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select count(distinct pl.language_id)::integer
    from public.profile_languages pl
   where pl.profile_id = target_user;
$$;

revoke all on function public.multilingual_language_count(uuid) from public, anon, authenticated;

create or replace function public.multilingual_grade_for_count(language_count integer)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select d.badge_key
    from public.profile_badge_definitions d
   where d.badge_key like 'multilingual-%'
     and d.is_system_derived
     and language_count is not null
     and d.minimum_profile_languages is not null
     and language_count >= d.minimum_profile_languages
   order by d.minimum_profile_languages desc, d.sort_order desc
   limit 1;
$$;

revoke all on function public.multilingual_grade_for_count(integer) from public, anon, authenticated;

create or replace function public.multilingual_grade(target_user uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.multilingual_grade_for_count(public.multilingual_language_count(target_user));
$$;

revoke all on function public.multilingual_grade(uuid) from public, anon, authenticated;

-- Keep one projection implementation for the public and staff readers so a
-- new derived family cannot be added to only one of the secure entry points.
create or replace function public.profile_badge_projection(target_user uuid, include_manual boolean)
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
  across_borders_badge_key text;
  regional_explorer_badge_key text;
  mail_reader_badge_key text;
  multilingual_badge_key text;
begin
  if target_user is null then
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
  select public.across_borders_grade(target_user) into across_borders_badge_key;
  select public.regional_explorer_grade(target_user) into regional_explorer_badge_key;
  select public.mail_reader_grade(target_user) into mail_reader_badge_key;
  select public.multilingual_grade(target_user) into multilingual_badge_key;

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
    select d.badge_key, d.label, d.icon, d.tone, true, null::timestamptz, d.sort_order
      from public.profile_badge_definitions d where d.badge_key = across_borders_badge_key
    union all
    select d.badge_key, d.label, d.icon, d.tone, true, null::timestamptz, d.sort_order
      from public.profile_badge_definitions d where d.badge_key = regional_explorer_badge_key
    union all
    select d.badge_key, d.label, d.icon, d.tone, true, null::timestamptz, d.sort_order
      from public.profile_badge_definitions d where d.badge_key = mail_reader_badge_key
    union all
    select d.badge_key, d.label, d.icon, d.tone, true, null::timestamptz, d.sort_order
      from public.profile_badge_definitions d where d.badge_key = multilingual_badge_key
    union all
    select d.badge_key, d.label, d.icon, d.tone, false, b.assigned_at, d.sort_order
      from public.profile_badges b
      join public.profile_badge_definitions d on d.badge_key = b.badge_key
     where include_manual and b.user_id = target_user and not d.is_system_derived
  )
  select a.badge_key, a.label, a.icon, a.tone, a.is_derived, a.assigned_at
    from available a
   order by a.sort_order, a.badge_key;
end;
$$;

revoke all on function public.profile_badge_projection(uuid, boolean) from public, anon, authenticated;

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
  return query select * from public.profile_badge_projection(target_user, true);
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
  return query select * from public.profile_badge_projection(target_user, true);
end;
$$;

revoke all on function public.admin_get_profile_badges(uuid) from public, anon;
grant execute on function public.admin_get_profile_badges(uuid) to authenticated;
