-- Snail Mail transport is selected once, on the server, when a letter is sent.
-- The client never supplies a mode and existing letters keep their original ETA.

alter table public.snail_mail_letters
  add column if not exists transport_mode text not null default 'standard',
  add column if not exists distance_band text not null default 'long_distance',
  add column if not exists base_delivery_hours integer not null default 96,
  add column if not exists transport_multiplier numeric(5,2) not null default 1.00,
  add column if not exists story_seed integer not null default 0,
  add column if not exists story_variant smallint not null default 0;

-- Preserve already-snapshotted delivery times.  Metadata for legacy rows is
-- inferred from their existing ETA and never changes deliver_at.
update public.snail_mail_letters
   set distance_band = case
         when extract(epoch from (deliver_at - sent_at)) <= 6 * 3600 then 'nearby'
         when extract(epoch from (deliver_at - sent_at)) <= 24 * 3600 then 'in_country'
         when extract(epoch from (deliver_at - sent_at)) <= 48 * 3600 then 'regional'
         else 'long_distance'
       end,
       base_delivery_hours = greatest(1, round(extract(epoch from (deliver_at - sent_at)) / 3600)::integer),
       transport_mode = 'standard',
       transport_multiplier = 1.00,
       story_seed = ((hashtextextended(id::text, 0) & 2147483647)::integer),
       story_variant = ((hashtextextended(id::text, 0) & 2147483647) % 3)::smallint
 where true;

alter table public.snail_mail_letters
  add constraint snail_mail_transport_mode_check
    check (transport_mode in ('express', 'standard', 'economy', 'air_mail', 'rail', 'sea_mail', 'rare_pigeon')),
  add constraint snail_mail_distance_band_check
    check (distance_band in ('nearby', 'in_country', 'regional', 'long_distance')),
  add constraint snail_mail_transport_hours_check
    check (base_delivery_hours > 0 and transport_multiplier between 0.60 and 1.50),
  add constraint snail_mail_story_variant_check
    check (story_variant between 0 and 2);

create or replace function public.snail_mail_distance_band(
  sender_country text,
  sender_region text,
  sender_locality bigint,
  recipient_country text,
  recipient_region text,
  recipient_locality bigint
)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  sender_macro text;
  recipient_macro text;
begin
  if sender_country is not null and sender_country = recipient_country then
    if sender_locality is not null and sender_locality = recipient_locality then
      return 'nearby';
    end if;
    return 'in_country';
  end if;

  select macro_region into sender_macro
    from public.snail_mail_country_groups where country_code = sender_country;
  select macro_region into recipient_macro
    from public.snail_mail_country_groups where country_code = recipient_country;
  if sender_macro is not null and sender_macro = recipient_macro then
    return 'regional';
  end if;
  return 'long_distance';
end;
$$;

create or replace function public.snail_mail_choose_transport(distance_band text, story_seed integer)
returns text
language plpgsql
immutable
security definer
set search_path = pg_catalog, public
as $$
declare
  bucket integer := mod(greatest(coalesce(story_seed, 0), 0), 1000);
begin
  -- The pigeon is a deterministic one-in-a-thousand surprise and is never
  -- selected for intercontinental routes.
  if distance_band = 'nearby' then
    if bucket = 0 then return 'rare_pigeon';
    elsif bucket < 140 then return 'express';
    elsif bucket < 300 then return 'economy';
    else return 'standard';
    end if;
  elsif distance_band = 'in_country' then
    if bucket < 100 then return 'express';
    elsif bucket < 260 then return 'economy';
    elsif bucket < 340 then return 'rail';
    else return 'standard';
    end if;
  elsif distance_band = 'regional' then
    if bucket < 500 then return 'air_mail';
    elsif bucket < 760 then return 'rail';
    elsif bucket < 920 then return 'standard';
    else return 'economy';
    end if;
  else
    -- Long routes strongly prefer realistic modes (air/standard/economy/sea); rail and pigeon
    -- are intentionally excluded because they would be geographically odd.
    if bucket < 500 then return 'air_mail';
    elsif bucket < 780 then return 'standard';
    elsif bucket < 950 then return 'economy';
    else return 'sea_mail';
    end if;
  end if;
end;
$$;

create or replace function public.snail_mail_transport_multiplier(mode text)
returns numeric
language sql
immutable
security definer
set search_path = pg_catalog, public
as $$
  select case mode
    when 'express' then 0.65
    when 'standard' then 1.00
    when 'economy' then 1.25
    when 'air_mail' then 0.85
    when 'rail' then 1.10
    when 'sea_mail' then 1.45
    when 'rare_pigeon' then 1.05
    else 1.00
  end::numeric;
$$;

revoke all on function public.snail_mail_distance_band(text, text, bigint, text, text, bigint) from public, anon, authenticated;
revoke all on function public.snail_mail_choose_transport(text, integer) from public, anon, authenticated;
revoke all on function public.snail_mail_transport_multiplier(text) from public, anon, authenticated;

create or replace function public.snail_mail_immutable_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.conversation_id is distinct from old.conversation_id
       or new.sender_id is distinct from old.sender_id
       or new.recipient_id is distinct from old.recipient_id
       or new.body is distinct from old.body
       or new.sent_at is distinct from old.sent_at
       or new.deliver_at is distinct from old.deliver_at
       or new.client_idempotency_key is distinct from old.client_idempotency_key
       or new.sender_country_code is distinct from old.sender_country_code
       or new.sender_region_code is distinct from old.sender_region_code
       or new.sender_locality_id is distinct from old.sender_locality_id
       or new.recipient_country_code is distinct from old.recipient_country_code
       or new.recipient_region_code is distinct from old.recipient_region_code
       or new.recipient_locality_id is distinct from old.recipient_locality_id
       or new.transport_mode is distinct from old.transport_mode
       or new.distance_band is distinct from old.distance_band
       or new.base_delivery_hours is distinct from old.base_delivery_hours
       or new.transport_multiplier is distinct from old.transport_multiplier
       or new.story_seed is distinct from old.story_seed
       or new.story_variant is distinct from old.story_variant then
      raise exception 'Snail Mail letters cannot be edited';
    end if;
    if (new.delivered_at is distinct from old.delivered_at
        or new.recipient_read_at is distinct from old.recipient_read_at)
       and coalesce(current_setting('app.snail_mail_system_write', true), '') <> '1' then
      raise exception 'Snail Mail delivery state is server-managed';
    end if;
  end if;
  return new;
end;
$$;

drop function if exists public.get_snail_mail_letter(uuid);
drop function if exists public.list_snail_mail(uuid);

create or replace function public.send_snail_mail(
  target_conversation uuid,
  letter_body text,
  idempotency_key uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid := auth.uid();
  other_user uuid;
  sender_profile record;
  recipient_profile record;
  clean_body text := btrim(coalesce(letter_body, ''));
  sent timestamp with time zone := now();
  existing_id uuid;
  distance_band text;
  base_eta_hours integer;
  final_eta_hours integer;
  transport_mode text;
  transport_multiplier numeric(5,2);
  story_seed integer;
  seed_text text;
begin
  if me is null or not public.is_email_verified() then
    raise exception 'Authentication required';
  end if;
  if char_length(clean_body) < 1 or char_length(clean_body) > 5000 then
    raise exception 'Letter must be between 1 and 5000 characters';
  end if;
  if not exists (
    select 1 from public.conversation_participants
     where conversation_id = target_conversation and user_id = me
  ) then
    raise exception 'Conversation unavailable';
  end if;
  select cp.user_id into other_user
    from public.conversation_participants cp
   where cp.conversation_id = target_conversation and cp.user_id <> me
   order by cp.user_id
   limit 1;
  if other_user is null then
    raise exception 'Conversation unavailable';
  end if;
  if idempotency_key is not null then
    select id into existing_id
      from public.snail_mail_letters
     where sender_id = me and client_idempotency_key = idempotency_key;
    if existing_id is not null then return existing_id; end if;
  end if;

  select id, country_code, region_code, locality_id, deactivated_at, inactive_mode
    into sender_profile
    from public.profiles where id = me;
  select id, country_code, region_code, locality_id, deactivated_at, inactive_mode
    into recipient_profile
    from public.profiles where id = other_user;
  if sender_profile.id is null or recipient_profile.id is null
     or sender_profile.deactivated_at is not null
     or recipient_profile.deactivated_at is not null
     or sender_profile.inactive_mode
     or recipient_profile.inactive_mode then
    raise exception 'Conversation unavailable';
  end if;
  if exists (
    select 1 from public.profile_blocks b
     where (b.blocker_id = me and b.blocked_id = other_user)
        or (b.blocker_id = other_user and b.blocked_id = me)
  ) then
    raise exception 'Conversation unavailable';
  end if;

  base_eta_hours := public.snail_mail_delivery_hours(
    sender_profile.country_code, sender_profile.region_code, sender_profile.locality_id,
    recipient_profile.country_code, recipient_profile.region_code, recipient_profile.locality_id
  );
  distance_band := public.snail_mail_distance_band(
    sender_profile.country_code, sender_profile.region_code, sender_profile.locality_id,
    recipient_profile.country_code, recipient_profile.region_code, recipient_profile.locality_id
  );
  seed_text := me::text || '|' || other_user::text || '|' || sent::text || '|' || clean_body;
  story_seed := (hashtextextended(seed_text, 0) & 2147483647)::integer;
  transport_mode := public.snail_mail_choose_transport(distance_band, story_seed);
  transport_multiplier := public.snail_mail_transport_multiplier(transport_mode)::numeric(5,2);
  final_eta_hours := greatest(1, ceil(base_eta_hours::numeric * transport_multiplier)::integer);

  insert into public.snail_mail_letters(
    conversation_id, sender_id, recipient_id, body, sent_at, deliver_at,
    client_idempotency_key, sender_country_code, sender_region_code, sender_locality_id,
    recipient_country_code, recipient_region_code, recipient_locality_id,
    transport_mode, distance_band, base_delivery_hours, transport_multiplier,
    story_seed, story_variant
  ) values (
    target_conversation, me, other_user, clean_body, sent,
    sent + make_interval(hours => final_eta_hours), idempotency_key,
    sender_profile.country_code, sender_profile.region_code, sender_profile.locality_id,
    recipient_profile.country_code, recipient_profile.region_code, recipient_profile.locality_id,
    transport_mode, distance_band, base_eta_hours, transport_multiplier,
    story_seed, (story_seed % 3)::smallint
  ) returning id into existing_id;
  return existing_id;
exception
  when unique_violation then
    if idempotency_key is not null then
      select id into existing_id
        from public.snail_mail_letters
       where sender_id = me and client_idempotency_key = idempotency_key;
      if existing_id is not null then return existing_id; end if;
    end if;
    raise;
end;
$$;

revoke all on function public.send_snail_mail(uuid, text, uuid) from public, anon;
grant execute on function public.send_snail_mail(uuid, text, uuid) to authenticated;

create or replace function public.list_snail_mail(target_conversation uuid)
returns table (
  id uuid,
  sender_id uuid,
  recipient_id uuid,
  sent_at timestamptz,
  deliver_at timestamptz,
  delivered_at timestamptz,
  recipient_read_at timestamptz,
  body text,
  body_available boolean,
  unread boolean,
  letter_status text,
  transport_mode text,
  distance_band text,
  base_delivery_hours integer,
  transport_multiplier numeric,
  story_seed integer,
  story_variant smallint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid := auth.uid();
  other_user uuid;
begin
  if me is null or not public.is_email_verified()
     or not exists (select 1 from public.conversation_participants where conversation_id = target_conversation and user_id = me)
     or exists (select 1 from public.profiles p where p.id = me and p.deactivated_at is not null) then
    raise exception 'Conversation unavailable';
  end if;
  select cp.user_id into other_user
    from public.conversation_participants cp
   where cp.conversation_id = target_conversation and cp.user_id <> me
   limit 1;
  if other_user is null or exists (select 1 from public.profiles p where p.id = other_user and p.deactivated_at is not null) or exists (
    select 1 from public.profile_blocks b
     where (b.blocker_id = me and b.blocked_id = other_user)
        or (b.blocker_id = other_user and b.blocked_id = me)
  ) then
    return;
  end if;
  return query
  select l.id, l.sender_id, l.recipient_id, l.sent_at, l.deliver_at,
         l.delivered_at, l.recipient_read_at,
         case when l.sender_id = me or l.deliver_at <= now() then l.body else null end,
         (l.sender_id = me or l.deliver_at <= now()),
         (l.recipient_id = me and l.delivered_at is not null and l.recipient_read_at is null),
         case when l.sender_id = me then 'outgoing'
              when l.deliver_at <= now() then 'delivered'
              else 'incoming' end,
         l.transport_mode, l.distance_band, l.base_delivery_hours,
         l.transport_multiplier, l.story_seed, l.story_variant
    from public.snail_mail_letters l
   where l.conversation_id = target_conversation
     and (l.sender_id = me or l.recipient_id = me)
   order by l.sent_at asc;
end;
$$;

revoke all on function public.list_snail_mail(uuid) from public, anon;
grant execute on function public.list_snail_mail(uuid) to authenticated;

create or replace function public.get_snail_mail_letter(letter_id uuid)
returns table (
  id uuid,
  sender_id uuid,
  recipient_id uuid,
  sent_at timestamptz,
  deliver_at timestamptz,
  delivered_at timestamptz,
  recipient_read_at timestamptz,
  body text,
  body_available boolean,
  unread boolean,
  letter_status text,
  transport_mode text,
  distance_band text,
  base_delivery_hours integer,
  transport_multiplier numeric,
  story_seed integer,
  story_variant smallint
)
language sql
security definer
set search_path = pg_catalog, public
as $$
  select * from public.list_snail_mail(
    (select conversation_id from public.snail_mail_letters where id = letter_id)
  ) where id = letter_id
$$;

revoke all on function public.get_snail_mail_letter(uuid) from public, anon;
grant execute on function public.get_snail_mail_letter(uuid) to authenticated;
