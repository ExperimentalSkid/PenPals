-- Automatically derive Quick Replier from the existing incoming response
-- opportunity population. The response-rate function remains authoritative
-- for visibility and sample-size semantics; this migration adds only the
-- average latency needed for the new badge family.

alter table public.profile_badge_definitions
  add column if not exists maximum_response_latency_hours numeric;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'profile_badge_definitions_maximum_response_latency_hours_check'
       and conrelid = 'public.profile_badge_definitions'::regclass
  ) then
    alter table public.profile_badge_definitions
      add constraint profile_badge_definitions_maximum_response_latency_hours_check
      check (maximum_response_latency_hours is null or maximum_response_latency_hours > 0);
  end if;
end;
$$;

comment on column public.profile_badge_definitions.maximum_response_latency_hours is
  'Maximum average qualifying first-response latency in hours for an automatically derived Quick Replier grade.';
comment on column public.profile_badge_definitions.minimum_completed_opportunities is
  'Minimum completed incoming response opportunities required for an automatically derived response-behavior grade.';

insert into public.profile_badge_definitions (
  badge_key, label, icon, tone, is_system_derived, sort_order,
  maximum_response_latency_hours, minimum_completed_opportunities
)
values
  ('quick-replier-bronze', 'Quick Replier · Bronze', 'people', 'quick-replier', true, 47, 72, 5),
  ('quick-replier-silver', 'Quick Replier · Silver', 'people', 'quick-replier', true, 48, 24, 5),
  ('quick-replier-gold', 'Quick Replier · Gold', 'people', 'quick-replier', true, 49, 8, 5),
  ('quick-replier-platinum', 'Quick Replier · Platinum', 'people', 'quick-replier', true, 50, 2, 5)
on conflict (badge_key) do update
  set label = excluded.label,
      icon = excluded.icon,
      tone = excluded.tone,
      is_system_derived = excluded.is_system_derived,
      sort_order = excluded.sort_order,
      maximum_response_latency_hours = excluded.maximum_response_latency_hours,
      minimum_completed_opportunities = excluded.minimum_completed_opportunities;

create or replace function public.quick_replier_grade_for_values(
  completed_opportunities integer,
  average_response_latency_hours numeric
)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select d.badge_key
    from public.profile_badge_definitions d
   where d.badge_key like 'quick-replier-%'
     and d.is_system_derived
     and completed_opportunities is not null
     and average_response_latency_hours is not null
     and d.minimum_completed_opportunities is not null
     and d.maximum_response_latency_hours is not null
     and completed_opportunities >= d.minimum_completed_opportunities
     and average_response_latency_hours <= d.maximum_response_latency_hours
   order by d.maximum_response_latency_hours asc, d.sort_order asc
   limit 1;
$$;

revoke all on function public.quick_replier_grade_for_values(integer, numeric) from public, anon, authenticated;

-- The current response statistics expose the qualifying opportunity count but
-- only expose a median latency. Reuse the exact same visibility, block/report
-- exclusions, statuses, and handled_at semantics here to derive an average
-- latency without copying rows into a badge table.
create or replace function public.quick_replier_average_latency_hours(target_user uuid)
returns numeric
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
with target as (
  select 1
    from public.profiles p
   where p.id = target_user
     and p.show_response_rate
     and public.viewer_can_access_profile(p.id)
), valid as (
  select i.created_at, i.handled_at, i.status
    from public.conversation_introductions i
   where i.recipient_id = target_user
     and exists (select 1 from target)
     and (
       i.status = 'expired'
       or (i.status in ('replied', 'declined') and i.handled_at is not null)
     )
     and not exists (
       select 1
         from public.profile_blocks b
        where (b.blocker_id = i.sender_id and b.blocked_id = i.recipient_id)
           or (b.blocker_id = i.recipient_id and b.blocked_id = i.sender_id)
     )
     and not exists (
       select 1
         from public.reports r
        where r.target_type = 'introduction'
          and r.target_id = i.id
          and r.status <> 'dismissed'
          and r.reason in (
            'spam', 'scam/fraud', 'harassment', 'sexual/inappropriate content',
            'hate/abuse', 'fake profile/impersonation', 'underage concern'
          )
     )
), stats as (
  select avg(extract(epoch from (handled_at - created_at)) / 3600.0)
           filter (where status in ('replied', 'declined')) as average_hours
    from valid
)
select average_hours
  from stats;
$$;

revoke all on function public.quick_replier_average_latency_hours(uuid) from public, anon, authenticated;

create or replace function public.quick_replier_grade(target_user uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.quick_replier_grade_for_values(
           s.completed_opportunities::integer,
           public.quick_replier_average_latency_hours(target_user)
         )
    from public.get_response_stats(target_user) s
   limit 1;
$$;

revoke all on function public.quick_replier_grade(uuid) from public, anon, authenticated;

-- Extend the public projection with one highest Quick Replier grade while
-- preserving Verified, every previous automatic family, and manual badges.
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
