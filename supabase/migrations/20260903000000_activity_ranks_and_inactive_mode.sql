-- Lightweight Penpal participation ranks.
--
-- `inactive_mode` is an explicit voluntary pause and is intentionally
-- separate from `deactivated_at` (account lifecycle/security state). Pausing
-- hides a profile from discovery/contact/presence while preserving all data.

alter table public.profiles
  add column if not exists inactive_mode boolean not null default false,
  add column if not exists accepting_new_conversations_before_inactive boolean;

create table if not exists public.activity_rank_definitions (
  rank_key text primary key
    check (rank_key = lower(btrim(rank_key)))
    check (rank_key ~ '^[a-z0-9_]+$'),
  display_name text not null unique
    check (char_length(btrim(display_name)) between 1 and 80),
  flavor_text text not null default ''
    check (char_length(flavor_text) <= 240),
  minimum_score integer not null check (minimum_score >= 0),
  sort_order integer not null unique check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.activity_rank_definitions (rank_key, display_name, flavor_text, minimum_score, sort_order)
values
  ('passing_notes', 'Passing Notes', 'Still finding their way around the mailroom.', 0, 0),
  ('postcard_scribbler', 'Postcard Scribbler', 'A few notes are already on the way.', 10, 1),
  ('letter_writer', 'Letter Writer', 'Their correspondence has a steady rhythm.', 25, 2),
  ('correspondent', 'Correspondent', 'This mailbox gets used.', 50, 3),
  ('seasoned_penpal', 'Seasoned Penpal', 'A thoughtful regular on the correspondence desk.', 90, 4),
  ('ink_veteran', 'Ink Veteran', 'Has seen a few postal routes.', 140, 5),
  ('master_correspondent', 'Master Correspondent', 'A long-standing member of the correspondence desk.', 220, 6)
on conflict (rank_key) do nothing;

alter table public.activity_rank_definitions enable row level security;
revoke all on table public.activity_rank_definitions from public, anon, authenticated;

create table if not exists public.activity_rank_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  rank_key text not null default 'passing_notes' references public.activity_rank_definitions(rank_key),
  current_score numeric(12,2) not null default 0 check (current_score >= 0),
  lifetime_score numeric(12,2) not null default 0 check (lifetime_score >= 0),
  distinct_active_days integer not null default 0 check (distinct_active_days >= 0),
  active_months integer not null default 0 check (active_months >= 0),
  last_meaningful_activity timestamptz,
  inactivity_days integer not null default 0 check (inactivity_days >= 0),
  decay_score numeric(12,2) not null default 0 check (decay_score >= 0),
  resume_decay_base numeric(12,2) check (resume_decay_base is null or resume_decay_base >= 0),
  last_calculated_at timestamptz not null default now(),
  last_resumed_at timestamptz not null default now(),
  is_frozen boolean not null default false,
  frozen_score numeric(12,2),
  frozen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not is_frozen or (frozen_at is not null and frozen_score is not null)),
  check (frozen_score is null or frozen_score >= 0)
);

alter table public.activity_rank_state
  add column if not exists resume_decay_base numeric(12,2)
    check (resume_decay_base is null or resume_decay_base >= 0);

alter table public.activity_rank_state enable row level security;
revoke all on table public.activity_rank_state from public, anon, authenticated;

create table if not exists public.activity_rank_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_key text not null check (char_length(btrim(event_key)) between 1 and 160),
  event_type text not null check (event_type in ('active_day', 'accepted_conversation', 'healthy_response')),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, event_key)
);

create index if not exists activity_rank_events_user_time_idx
  on public.activity_rank_events (user_id, occurred_at desc);

alter table public.activity_rank_events enable row level security;
revoke all on table public.activity_rank_events from public, anon, authenticated;

drop trigger if exists activity_rank_state_updated_at on public.activity_rank_state;
create trigger activity_rank_state_updated_at
before update on public.activity_rank_state
for each row execute function public.set_updated_at();

drop trigger if exists activity_rank_definitions_updated_at on public.activity_rank_definitions;
create trigger activity_rank_definitions_updated_at
before update on public.activity_rank_definitions
for each row execute function public.set_updated_at();

create or replace function public.ensure_activity_rank_state()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.activity_rank_state (
    user_id, rank_key, last_meaningful_activity, last_resumed_at, is_frozen,
    frozen_score, frozen_at
  ) values (
    new.id, 'passing_notes', new.last_active_at, coalesce(new.last_active_at, new.created_at),
    false, null, null
  ) on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function public.ensure_activity_rank_state() from public, anon, authenticated;

drop trigger if exists profiles_activity_rank_state on public.profiles;
create trigger profiles_activity_rank_state
after insert on public.profiles
for each row execute function public.ensure_activity_rank_state();

insert into public.activity_rank_state (user_id, rank_key, last_meaningful_activity, last_resumed_at)
select p.id, 'passing_notes', p.last_active_at, coalesce(p.last_active_at, p.created_at)
  from public.profiles p
on conflict (user_id) do nothing;

create or replace function public.refresh_activity_rank(target_user uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  profile_row public.profiles%rowtype;
  state_row public.activity_rank_state%rowtype;
  lifetime numeric(12,2);
  active_days integer;
  months integer;
  last_activity timestamptz;
  anchor timestamptz;
  elapsed_days integer;
  grace_days constant integer := 30;
  decay numeric(12,2);
  resume_decay_baseline numeric(12,2);
  score numeric(12,2);
  target_rank text;
  target_order integer;
  target_minimum integer;
  current_order integer;
  current_minimum integer;
  next_rank text;
begin
  if target_user is null then return; end if;

  select * into profile_row from public.profiles where id = target_user;
  if not found then return; end if;

  insert into public.activity_rank_state (user_id, last_meaningful_activity, last_resumed_at)
  values (target_user, profile_row.last_active_at, coalesce(profile_row.last_active_at, profile_row.created_at))
  on conflict (user_id) do nothing;

  select * into state_row from public.activity_rank_state where user_id = target_user for update;

  -- Voluntary pause and account deactivation are distinct states. Both stop
  -- participation updates, but only inactive_mode is the user-facing pause.
  if profile_row.inactive_mode then
    update public.activity_rank_state
       set is_frozen = true,
           frozen_at = coalesce(frozen_at, now()),
           frozen_score = coalesce(frozen_score, current_score),
           resume_decay_base = null,
           last_calculated_at = now(),
           updated_at = now()
     where user_id = target_user;
    return;
  end if;

  if state_row.is_frozen then
    resume_decay_baseline := coalesce(state_row.decay_score, 0);
    update public.activity_rank_state
       set is_frozen = false,
           frozen_at = null,
           frozen_score = null,
           resume_decay_base = resume_decay_baseline,
           last_resumed_at = now(),
           last_calculated_at = now(),
           updated_at = now()
     where user_id = target_user;
    select * into state_row from public.activity_rank_state where user_id = target_user;
  end if;

  select
    least(1000::numeric, coalesce(sum(case event_type
      when 'active_day' then 1
      when 'accepted_conversation' then 6
      when 'healthy_response' then 4
      else 0 end), 0)::numeric),
    count(distinct occurred_at::date)::integer,
    count(distinct date_trunc('month', occurred_at))::integer,
    max(occurred_at)
    into lifetime, active_days, months, last_activity
    from public.activity_rank_events
   where user_id = target_user;

  anchor := greatest(
    coalesce(last_activity, profile_row.created_at),
    coalesce(state_row.last_resumed_at, profile_row.created_at)
  );
  elapsed_days := greatest(0, floor(extract(epoch from (now() - anchor)) / 86400)::integer - grace_days);
  decay := least(lifetime * 0.50, coalesce(state_row.resume_decay_base, 0) + elapsed_days * 0.10);
  score := greatest(0, lifetime - decay);

  select d.rank_key, d.sort_order, d.minimum_score
    into target_rank, target_order, target_minimum
    from public.activity_rank_definitions d
   where d.minimum_score <= score
   order by d.minimum_score desc
   limit 1;
  target_rank := coalesce(target_rank, 'passing_notes');

  select d.sort_order, d.minimum_score
    into current_order, current_minimum
    from public.activity_rank_definitions d
   where d.rank_key = state_row.rank_key;

  next_rank := state_row.rank_key;
  if target_order is null then
    next_rank := 'passing_notes';
  elsif current_order is null or target_order > current_order then
    next_rank := target_rank;
  elsif target_order < current_order and score < greatest(0, current_minimum - 5) then
    next_rank := target_rank;
  end if;

  update public.activity_rank_state
     set rank_key = next_rank,
         current_score = score,
         lifetime_score = lifetime,
         distinct_active_days = active_days,
         active_months = months,
         last_meaningful_activity = last_activity,
         inactivity_days = elapsed_days,
         decay_score = decay,
         last_calculated_at = now(),
         updated_at = now()
   where user_id = target_user;
end;
$$;

revoke all on function public.refresh_activity_rank(uuid) from public, anon, authenticated;

create or replace function public.record_activity_event(
  target_user uuid,
  p_event_key text,
  p_event_type text,
  event_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  inserted_count integer;
  bounded_time timestamptz := least(coalesce(event_time, now()), now());
begin
  if target_user is null or p_event_key is null or char_length(btrim(p_event_key)) = 0 then return; end if;
  if p_event_type not in ('active_day', 'accepted_conversation', 'healthy_response') then return; end if;
  if not exists (
    select 1 from public.profiles p
     where p.id = target_user
       and p.deactivated_at is null
       and p.inactive_mode = false
  ) then return; end if;

  -- Healthy conversation/response signals are capped per day so a short burst
  -- cannot grind a rank. The unique event key makes retries idempotent.
  if p_event_type <> 'active_day' and (
    select count(*) from public.activity_rank_events e
     where e.user_id = target_user
       and e.event_type = p_event_type
       and e.occurred_at::date = bounded_time::date
  ) >= 3 then return; end if;

  insert into public.activity_rank_events (user_id, event_key, event_type, occurred_at)
  values (target_user, btrim(p_event_key), p_event_type, bounded_time)
  on conflict (user_id, event_key) do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count = 1 then perform public.refresh_activity_rank(target_user); end if;
end;
$$;

revoke all on function public.record_activity_event(uuid, text, text, timestamptz) from public, anon, authenticated;

create or replace function public.activity_rank_lifecycle_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.inactive_mode is distinct from old.inactive_mode then
    perform public.refresh_activity_rank(new.id);
  end if;
  return new;
end;
$$;

revoke all on function public.activity_rank_lifecycle_guard() from public, anon, authenticated;

drop trigger if exists profiles_activity_rank_lifecycle on public.profiles;
create trigger profiles_activity_rank_lifecycle
after update of inactive_mode on public.profiles
for each row execute function public.activity_rank_lifecycle_guard();

-- Pause is changed only through the protected settings function below. This
-- keeps an authenticated client from forging lifecycle transitions directly on
-- the profiles table.
create or replace function public.protect_inactive_mode()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'UPDATE'
     and new.inactive_mode is distinct from old.inactive_mode
     and coalesce(current_setting('app.allow_inactive_mode_change', true), '') <> '1' then
    raise exception 'Inactive mode changes require the protected settings action';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_inactive_mode() from public, anon, authenticated;

drop trigger if exists profiles_inactive_mode_guard on public.profiles;
create trigger profiles_inactive_mode_guard
before update of inactive_mode on public.profiles
for each row execute function public.protect_inactive_mode();

-- Preserve the user's introduction preference while paused. The existing
-- deactivation preference column remains independent and untouched.
create or replace function public.save_privacy_settings(
  p_profile_visibility text,
  p_show_city boolean,
  p_show_activity_status boolean,
  p_show_response_rate boolean,
  p_accepting_new_conversations boolean,
  p_introduction_scope text,
  p_availability text,
  p_country_codes text[] default '{}'::text[],
  p_inactive_mode boolean default false
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid := auth.uid();
  clean_codes text[] := array(
    select distinct upper(btrim(code))
      from unnest(coalesce(p_country_codes, '{}'::text[])) as input(code)
     where btrim(code) <> ''
  );
  currently_inactive boolean;
begin
  if me is null or not public.is_email_verified() then raise exception 'Authentication required'; end if;
  if p_profile_visibility not in ('public', 'authenticated_only')
     or p_introduction_scope not in ('everyone', 'matching_preferences', 'verified_only', 'nobody')
     or p_availability not in ('available', 'away') then
    raise exception 'Invalid privacy settings';
  end if;
  if exists (select 1 from unnest(clean_codes) as selected(code) where selected.code !~ '^[A-Z]{2,3}$') then
    raise exception 'Invalid country exclusion';
  end if;

  select inactive_mode into currently_inactive from public.profiles where id = me for update;
  if currently_inactive is null then raise exception 'Profile not found'; end if;
  perform set_config('app.allow_inactive_mode_change', '1', true);

  update public.profiles
     set profile_visibility = p_profile_visibility,
         show_city = coalesce(p_show_city, false),
         show_activity_status = coalesce(p_show_activity_status, false),
         show_response_rate = coalesce(p_show_response_rate, false),
         accepting_new_conversations_before_inactive = case
           when not currently_inactive and coalesce(p_inactive_mode, false) then p_accepting_new_conversations
           when currently_inactive and not coalesce(p_inactive_mode, false) then null
           else accepting_new_conversations_before_inactive
         end,
         accepting_new_conversations = case
           when coalesce(p_inactive_mode, false) then false
           when currently_inactive and not coalesce(p_inactive_mode, false) then coalesce(accepting_new_conversations_before_inactive, p_accepting_new_conversations)
           else coalesce(p_accepting_new_conversations, false)
         end,
         introduction_scope = p_introduction_scope,
         availability = p_availability,
         inactive_mode = coalesce(p_inactive_mode, false)
   where id = me;
  if not found then raise exception 'Profile not found'; end if;

  delete from public.profile_introduction_country_exclusions where profile_id = me;
  insert into public.profile_introduction_country_exclusions (profile_id, country_code)
  select me, selected.code from unnest(clean_codes) as selected(code);
end;
$$;

revoke all on function public.save_privacy_settings(text, boolean, boolean, boolean, boolean, text, text, text[], boolean) from public, anon, authenticated;
grant execute on function public.save_privacy_settings(text, boolean, boolean, boolean, boolean, text, text, text[], boolean) to authenticated;

-- Paused users keep their records and existing conversations, but cannot start
-- or continue new contact while paused. These guards cover every insert path,
-- including direct RPC/table attempts, without changing ordinary deactivation
-- behavior.
create or replace function public.reject_inactive_contact()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1 from public.profiles p
     where p.id in (new.sender_id, new.recipient_id)
       and (p.deactivated_at is not null or p.inactive_mode)
  ) then
    raise exception 'Conversation unavailable';
  end if;
  return new;
end;
$$;

revoke all on function public.reject_inactive_contact() from public, anon, authenticated;

drop trigger if exists introductions_inactive_guard on public.conversation_introductions;
create trigger introductions_inactive_guard
before insert on public.conversation_introductions
for each row execute function public.reject_inactive_contact();

create or replace function public.reject_inactive_message()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1 from public.profiles p
     where p.id = new.sender_id
       and (p.deactivated_at is not null or p.inactive_mode)
  ) then
    raise exception 'Conversation unavailable';
  end if;
  return new;
end;
$$;

revoke all on function public.reject_inactive_message() from public, anon, authenticated;

drop trigger if exists messages_inactive_guard on public.messages;
create trigger messages_inactive_guard
before insert on public.messages
for each row execute function public.reject_inactive_message();

-- Presence authorization must treat voluntary pause as unavailable without
-- conflating it with account deactivation.
drop policy if exists "Penpal presence publish" on realtime.messages;
create policy "Penpal presence publish"
on realtime.messages
for insert to authenticated
with check (
  realtime.topic() like 'presence:user:%'
  and exists (
    select 1 from public.profiles p
     where p.id = auth.uid()
       and p.deactivated_at is null
       and p.inactive_mode = false
  )
  and (case
    when realtime.topic() ~ '^presence:user:[0-9a-fA-F-]{36}$'
      then (substring(realtime.topic() from '^presence:user:([0-9a-fA-F-]{36})$'))::uuid = auth.uid()
    else false
  end)
);

drop policy if exists "Penpal presence read" on realtime.messages;
create policy "Penpal presence read"
on realtime.messages
for select to authenticated
using (
  realtime.topic() ~ '^presence:user:[0-9a-fA-F-]{36}$'
  and exists (
    select 1 from public.profiles target
     where target.id = (substring(realtime.topic() from '^presence:user:([0-9a-fA-F-]{36})$'))::uuid
       and target.deactivated_at is null
       and target.inactive_mode = false
       and (target.id = auth.uid() or target.show_activity_status = true)
  )
  and not exists (
    select 1 from public.profile_blocks b
     where (b.blocker_id = auth.uid() and b.blocked_id = (substring(realtime.topic() from '^presence:user:([0-9a-fA-F-]{36})$'))::uuid)
        or (b.blocked_id = auth.uid() and b.blocker_id = (substring(realtime.topic() from '^presence:user:([0-9a-fA-F-]{36})$'))::uuid)
  )
);

-- Expose only the public rank/flavor. Raw scores and event history stay in the
-- revoked internal tables and are available to the admin-only metrics helper.
create or replace function public.get_public_activity_rank(target_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object('name', d.display_name, 'flavor', d.flavor_text)
    from public.activity_rank_state s
    join public.activity_rank_definitions d on d.rank_key = s.rank_key
   where s.user_id = target_user;
$$;

revoke all on function public.get_public_activity_rank(uuid) from public, anon, authenticated;

create or replace function public.admin_get_activity_rank_metrics(target_user uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then raise exception 'Administrator authorization required'; end if;
  perform public.refresh_activity_rank(target_user);
  select jsonb_build_object(
    'rank', d.display_name,
    'rank_key', s.rank_key,
    'current_score', s.current_score,
    'lifetime_score', s.lifetime_score,
    'distinct_active_days', s.distinct_active_days,
    'active_months', s.active_months,
    'last_meaningful_activity', s.last_meaningful_activity,
    'inactivity_days', s.inactivity_days,
    'decay_score', s.decay_score,
    'is_frozen', s.is_frozen,
    'frozen_score', s.frozen_score,
    'frozen_at', s.frozen_at,
    'last_calculated_at', s.last_calculated_at
  ) into result
    from public.activity_rank_state s
    join public.activity_rank_definitions d on d.rank_key = s.rank_key
   where s.user_id = target_user;
  return coalesce(result, '{}'::jsonb);
end;
$$;

revoke all on function public.admin_get_activity_rank_metrics(uuid) from public, anon, authenticated;
grant execute on function public.admin_get_activity_rank_metrics(uuid) to authenticated;

-- Record one distinct active-day signal from the existing five-minute activity
-- touch. This keeps earning event-based and avoids a new presence heartbeat.
create or replace function public.touch_activity()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_email_verified() then return; end if;
  if exists (select 1 from public.profiles where id = auth.uid() and (deactivated_at is not null or inactive_mode)) then return; end if;
  update public.profiles set last_active_at = now()
   where id = auth.uid() and (last_active_at is null or last_active_at < now() - interval '5 minutes');
  perform public.record_activity_event(auth.uid(), 'active-day:' || to_char(current_date, 'YYYY-MM-DD'), 'active_day', now());
end;
$$;

revoke all on function public.touch_activity() from public, anon, authenticated;
grant execute on function public.touch_activity() to authenticated;

create or replace function public.record_activity_from_introduction()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if old.status = 'pending' and new.status = 'replied' then
    perform public.record_activity_event(new.sender_id, 'accepted-introduction:' || new.id::text, 'accepted_conversation', coalesce(new.handled_at, now()));
  end if;
  return new;
end;
$$;

revoke all on function public.record_activity_from_introduction() from public, anon, authenticated;

drop trigger if exists introductions_activity_rank_event on public.conversation_introductions;
create trigger introductions_activity_rank_event
after update of status on public.conversation_introductions
for each row execute function public.record_activity_from_introduction();

create or replace function public.record_activity_from_response()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if old.responded_at is null and new.responded_at is not null then
    perform public.record_activity_event(new.recipient_id, 'healthy-response:' || new.conversation_id::text, 'healthy_response', new.responded_at);
  end if;
  return new;
end;
$$;

revoke all on function public.record_activity_from_response() from public, anon, authenticated;

drop trigger if exists response_opportunities_activity_rank_event on public.response_opportunities;
create trigger response_opportunities_activity_rank_event
after update of responded_at on public.response_opportunities
for each row execute function public.record_activity_from_response();

-- Add the public rank to the existing privacy-safe profile projection. No
-- score, event count, pause state, or internal state is returned.
create or replace function public.get_public_profile(target_username text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  profile_row public.profiles;
  response_label text;
  rank_json jsonb;
begin
  select p.* into profile_row
    from public.profiles p
   where p.username = lower(btrim(target_username))
     and public.viewer_can_access_profile(p.id);
  if not found then return null; end if;

  select case
           when s.completed_opportunities >= 5 and s.response_rate is not null then s.response_rate::text || '%'
           else 'New member'
         end into response_label
    from public.get_response_stats(profile_row.id) s;
  rank_json := public.get_public_activity_rank(profile_row.id);

  return jsonb_build_object(
    'id', profile_row.id,
    'username', profile_row.username,
    'display_name', profile_row.display_name,
    'birth_date', profile_row.birth_date,
    'gender', profile_row.gender,
    'country', profile_row.country,
    'city', case when profile_row.show_city then profile_row.city else null end,
    'bio', profile_row.bio,
    'quote', profile_row.quote,
    'looking_for', profile_row.looking_for,
    'avatar_path', case when public.can_view_profile_photo(profile_row.id, auth.uid()) then profile_row.avatar_path else null end,
    'availability', case when profile_row.show_activity_status and not profile_row.inactive_mode then profile_row.availability else null end,
    'activity_status', case
      when not profile_row.show_activity_status or profile_row.inactive_mode then null
      when profile_row.availability = 'away' then 'Away'
      when profile_row.last_active_at is null then 'Active more than a week ago'
      when profile_row.last_active_at >= now() - interval '5 minutes' then 'Online now'
      when profile_row.last_active_at >= now() - interval '1 hour' then 'Active recently'
      when profile_row.last_active_at >= now() - interval '1 day' then 'Active today'
      when profile_row.last_active_at >= now() - interval '7 days' then 'Active this week'
      else 'Active more than a week ago'
    end,
    'response_rate_label', response_label,
    'is_verified', public.is_profile_verified(profile_row.id),
    'activity_rank', coalesce(rank_json ->> 'name', 'Passing Notes'),
    'activity_rank_flavor', rank_json ->> 'flavor'
  );
end;
$$;

revoke all on function public.get_public_profile(text) from public, anon;
grant execute on function public.get_public_profile(text) to authenticated;

-- Voluntary pause is also excluded from the privacy-aware discovery projection.
-- Keep the established return shape (including the coarse recently_active flag)
-- so existing filters/pagination continue to work without exposing pause state.
drop function if exists public.get_discover_profiles(uuid);

create function public.get_discover_profiles(viewer uuid default auth.uid())
returns table (
  id uuid,
  username text,
  display_name text,
  birth_date date,
  gender text,
  country text,
  city text,
  avatar_path text,
  last_active_at timestamptz,
  recently_active boolean,
  quote text
)
language sql
security definer
set search_path = pg_catalog, public
as $$
  select p.id,
         p.username,
         p.display_name,
         p.birth_date,
         p.gender,
         p.country,
         case when p.show_city then p.city end,
         null::text,
         null::timestamptz,
         case
           when p.show_activity_status then p.last_active_at >= now() - interval '24 hours'
           else null
         end,
         p.quote
    from public.profiles p
   where p.id <> auth.uid()
     and p.deactivated_at is null
     and p.inactive_mode = false
     and p.last_active_at >= now() - interval '7 days'
     and nullif(btrim(p.display_name), '') is not null
     and p.birth_date is not null
     and nullif(btrim(p.gender), '') is not null
     and nullif(btrim(p.country), '') is not null
     and nullif(btrim(p.city), '') is not null
     and nullif(btrim(p.bio), '') is not null
     and nullif(btrim(p.quote), '') is not null
     and nullif(btrim(p.looking_for), '') is not null
     and nullif(btrim(p.avatar_path), '') is not null
     and exists (
       select 1 from public.profile_languages pl where pl.profile_id = p.id
     )
     and (
       select count(*) from public.profile_interests pi where pi.profile_id = p.id
     ) >= 3
     and public.viewer_can_access_profile(p.id)
   order by p.last_active_at desc nulls last, p.created_at desc;
$$;

revoke all on function public.get_discover_profiles(uuid) from public, anon, authenticated;
grant execute on function public.get_discover_profiles(uuid) to authenticated;

-- Identity links are intentionally independent from discovery eligibility. A
-- paused participant remains resolvable for existing private conversations,
-- but must not advertise activity or availability while paused.
create or replace function public.resolve_profile_identity(target_user uuid)
returns table (
  id uuid,
  username text,
  display_name text,
  birth_date date,
  avatar_path text,
  activity_status text,
  availability text
)
language sql
security definer
set search_path = pg_catalog, public
as $$
  select p.id,
         p.username,
         p.display_name,
         p.birth_date,
         case when public.can_view_profile_photo(p.id, auth.uid()) then p.avatar_path end,
         case
           when p.inactive_mode or not p.show_activity_status then null
           when p.availability = 'away' then 'Away'
           when p.last_active_at is null then 'Active more than a week ago'
           when p.last_active_at >= now() - interval '5 minutes' then 'Online now'
           when p.last_active_at >= now() - interval '1 hour' then 'Active recently'
           when p.last_active_at >= now() - interval '1 day' then 'Active today'
           when p.last_active_at >= now() - interval '7 days' then 'Active this week'
           else 'Active more than a week ago'
         end,
         case when p.inactive_mode or not p.show_activity_status then null else p.availability end
    from public.profiles p
   where p.id = target_user
     and public.viewer_can_access_profile(p.id);
$$;

revoke all on function public.resolve_profile_identity(uuid) from public, anon;
grant execute on function public.resolve_profile_identity(uuid) to authenticated;
