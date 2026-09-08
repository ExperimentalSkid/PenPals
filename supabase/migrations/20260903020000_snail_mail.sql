-- Optional digital Snail Mail.  Letters are immutable after send and use a
-- server-snapshotted coarse location pair to calculate a stable delivery ETA.
-- No coordinates, addresses, or transport randomness are stored.

create table if not exists public.snail_mail_country_groups (
  country_code text primary key references public.country_codes(code),
  macro_region text not null check (char_length(btrim(macro_region)) between 1 and 80)
);

-- This is protected configuration.  Unknown countries deliberately fall back
-- to the long-distance band instead of guessing a geography.
insert into public.snail_mail_country_groups(country_code, macro_region) values
  ('PT', 'Europe'), ('IT', 'Europe'), ('DK', 'Europe'), ('ES', 'Europe'),
  ('JP', 'Asia'), ('KR', 'Asia'), ('IN', 'Asia'),
  ('CA', 'Americas'), ('BR', 'Americas'), ('NG', 'Africa'), ('AU', 'Oceania')
on conflict (country_code) do update set macro_region = excluded.macro_region;

alter table public.snail_mail_country_groups enable row level security;
revoke all on table public.snail_mail_country_groups from public, anon, authenticated;

create table if not exists public.snail_mail_letters (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  sent_at timestamptz not null default now(),
  deliver_at timestamptz not null,
  delivered_at timestamptz,
  recipient_read_at timestamptz,
  client_idempotency_key uuid,
  sender_country_code text references public.country_codes(code),
  sender_region_code text,
  sender_locality_id bigint,
  recipient_country_code text references public.country_codes(code),
  recipient_region_code text,
  recipient_locality_id bigint,
  created_at timestamptz not null default now(),
  constraint snail_mail_distinct_participants check (sender_id <> recipient_id),
  constraint snail_mail_delivery_after_send check (deliver_at >= sent_at),
  constraint snail_mail_delivery_timestamps check (
    (delivered_at is null or delivered_at >= sent_at)
    and (recipient_read_at is null or delivered_at is not null)
  ),
  constraint snail_mail_sender_region_fk foreign key (sender_country_code, sender_region_code)
    references public.location_regions(country_code, region_code),
  constraint snail_mail_recipient_region_fk foreign key (recipient_country_code, recipient_region_code)
    references public.location_regions(country_code, region_code),
  constraint snail_mail_sender_locality_fk foreign key (sender_locality_id)
    references public.location_localities(id),
  constraint snail_mail_recipient_locality_fk foreign key (recipient_locality_id)
    references public.location_localities(id)
);

create unique index if not exists snail_mail_sender_idempotency_idx
  on public.snail_mail_letters(sender_id, client_idempotency_key)
  where client_idempotency_key is not null;
create index if not exists snail_mail_conversation_sent_idx
  on public.snail_mail_letters(conversation_id, sent_at);
create index if not exists snail_mail_due_idx
  on public.snail_mail_letters(deliver_at)
  where delivered_at is null;

alter table public.snail_mail_letters enable row level security;
-- Deliberately no table policies or client grants.  RPCs below mask early
-- bodies and enforce participant/privacy checks before returning anything.
revoke all on table public.snail_mail_letters from public, anon, authenticated;

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
       or new.recipient_locality_id is distinct from old.recipient_locality_id then
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

revoke all on function public.snail_mail_immutable_guard() from public, anon, authenticated;
drop trigger if exists snail_mail_immutable on public.snail_mail_letters;
create trigger snail_mail_immutable
before update on public.snail_mail_letters
for each row execute function public.snail_mail_immutable_guard();

create or replace function public.snail_mail_delivery_hours(
  sender_country text,
  sender_region text,
  sender_locality bigint,
  recipient_country text,
  recipient_region text,
  recipient_locality bigint
)
returns integer
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
      return 6;
    end if;
    if sender_region is not null and sender_region = recipient_region then
      return 12;
    end if;
    return 24;
  end if;

  select macro_region into sender_macro
    from public.snail_mail_country_groups where country_code = sender_country;
  select macro_region into recipient_macro
    from public.snail_mail_country_groups where country_code = recipient_country;
  if sender_macro is not null and sender_macro = recipient_macro then
    return 48;
  end if;
  return 96;
end;
$$;

revoke all on function public.snail_mail_delivery_hours(text, text, bigint, text, text, bigint)
  from public, anon, authenticated;

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
  eta_hours integer;
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
  select id, country_code, region_code, locality_id, deactivated_at,
         inactive_mode
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

  eta_hours := public.snail_mail_delivery_hours(
    sender_profile.country_code, sender_profile.region_code, sender_profile.locality_id,
    recipient_profile.country_code, recipient_profile.region_code, recipient_profile.locality_id
  );
  insert into public.snail_mail_letters(
    conversation_id, sender_id, recipient_id, body, sent_at, deliver_at,
    client_idempotency_key, sender_country_code, sender_region_code, sender_locality_id,
    recipient_country_code, recipient_region_code, recipient_locality_id
  ) values (
    target_conversation, me, other_user, clean_body, sent,
    sent + make_interval(hours => eta_hours), idempotency_key,
    sender_profile.country_code, sender_profile.region_code, sender_profile.locality_id,
    recipient_profile.country_code, recipient_profile.region_code, recipient_profile.locality_id
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
  letter_status text
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
              else 'incoming' end
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
  letter_status text
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

create or replace function public.mark_snail_mail_read(letter_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null or not public.is_email_verified()
     or exists (select 1 from public.profiles p where p.id = me and (p.deactivated_at is not null or p.inactive_mode)) then
    raise exception 'Authentication required';
  end if;
  perform 1 from public.snail_mail_letters l
   where l.id = letter_id and l.recipient_id = me and l.deliver_at <= now();
  if not found then raise exception 'Letter is not delivered'; end if;
  perform set_config('app.snail_mail_system_write', '1', true);
  update public.snail_mail_letters
     set delivered_at = coalesce(delivered_at, now()),
         recipient_read_at = coalesce(recipient_read_at, now())
   where id = letter_id and recipient_id = me;
end;
$$;

revoke all on function public.mark_snail_mail_read(uuid) from public, anon;
grant execute on function public.mark_snail_mail_read(uuid) to authenticated;

create or replace function public.process_snail_mail_delivery(batch_size integer default 100)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  processed integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Background worker authorization required';
  end if;
  if batch_size is null or batch_size < 1 or batch_size > 500 then batch_size := 100; end if;
  perform set_config('app.snail_mail_system_write', '1', true);
  with due as (
    select l.id
      from public.snail_mail_letters l
      join public.profiles p on p.id = l.recipient_id
     where l.delivered_at is null
       and l.deliver_at <= now()
       and p.deactivated_at is null
       and p.inactive_mode = false
       and not exists (
         select 1 from public.profile_blocks b
          where (b.blocker_id = l.sender_id and b.blocked_id = l.recipient_id)
             or (b.blocker_id = l.recipient_id and b.blocked_id = l.sender_id)
       )
     order by l.deliver_at, l.sent_at
     for update of l skip locked
     limit batch_size
  )
  update public.snail_mail_letters l
     set delivered_at = now()
    from due
   where l.id = due.id;
  get diagnostics processed = row_count;
  return processed;
end;
$$;

revoke all on function public.process_snail_mail_delivery(integer) from public, anon, authenticated;
grant execute on function public.process_snail_mail_delivery(integer) to service_role;
