-- Allow a sender to withdraw a Snail Mail letter while it is still travelling.
-- The cancellation state is server-managed, preserves the immutable body for
-- the sender, and is presented to the recipient only as a shared fictional
-- "lost in transit" outcome.

alter table public.snail_mail_letters
  add column if not exists cancelled_at timestamptz;

alter table public.snail_mail_letters
  drop constraint if exists snail_mail_cancelled_before_delivery;

alter table public.snail_mail_letters
  add constraint snail_mail_cancelled_before_delivery
  check (cancelled_at is null or delivered_at is null);

create index if not exists snail_mail_active_sender_recipient_idx
  on public.snail_mail_letters(sender_id, recipient_id, sent_at)
  where delivered_at is null and cancelled_at is null;

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
    if new.cancelled_at is distinct from old.cancelled_at
       and coalesce(current_setting('app.snail_mail_cancel_write', true), '') <> '1' then
      raise exception 'Snail Mail cancellation is server-managed';
    end if;
    if new.cancelled_at is not null and new.delivered_at is not null then
      raise exception 'A delivered Snail Mail letter cannot be cancelled';
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
         case when l.sender_id = me
                    or (l.cancelled_at is null and l.deliver_at <= now())
              then l.body else null end,
         (l.sender_id = me
            or (l.cancelled_at is null and l.deliver_at <= now())),
         (l.recipient_id = me and l.cancelled_at is null
            and l.delivered_at is not null and l.recipient_read_at is null),
         case when l.cancelled_at is not null then 'lost_in_transit'
              when l.sender_id = me then 'outgoing'
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

create or replace function public.cancel_snail_mail(letter_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid := auth.uid();
  letter_row public.snail_mail_letters%rowtype;
begin
  if me is null or not public.is_email_verified() then
    raise exception 'Authentication required';
  end if;

  select l.* into letter_row
    from public.snail_mail_letters l
   where l.id = letter_id
     and l.sender_id = me
     and exists (
       select 1 from public.conversation_participants cp
        where cp.conversation_id = l.conversation_id and cp.user_id = me
     )
   for update;

  if not found then
    raise exception 'Letter is no longer in transit';
  end if;
  if letter_row.cancelled_at is not null
     or letter_row.delivered_at is not null
     or letter_row.deliver_at <= now() then
    raise exception 'Letter is no longer in transit';
  end if;

  perform set_config('app.snail_mail_cancel_write', '1', true);
  update public.snail_mail_letters
     set cancelled_at = now()
   where id = letter_row.id
     and cancelled_at is null
     and delivered_at is null
     and deliver_at > now();
  if not found then
    raise exception 'Letter is no longer in transit';
  end if;
end;
$$;

revoke all on function public.cancel_snail_mail(uuid) from public, anon;
grant execute on function public.cancel_snail_mail(uuid) to authenticated;

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
       and l.cancelled_at is null
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
   where l.id = due.id
     and l.delivered_at is null
     and l.cancelled_at is null;
  get diagnostics processed = row_count;
  return processed;
end;
$$;

revoke all on function public.process_snail_mail_delivery(integer) from public, anon, authenticated;
grant execute on function public.process_snail_mail_delivery(integer) to service_role;

create or replace function public.enforce_snail_mail_pair_limit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.client_idempotency_key is not null
     and exists (
       select 1
         from public.snail_mail_letters l
        where l.sender_id = new.sender_id
          and l.client_idempotency_key = new.client_idempotency_key
     ) then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'snail-mail-antispam:' || new.sender_id::text || ':' || new.recipient_id::text,
      0
    )
  );

  if exists (
    select 1
      from public.snail_mail_letters l
     where l.sender_id = new.sender_id
       and l.recipient_id = new.recipient_id
       and l.cancelled_at is null
       and l.delivered_at is null
  ) then
    raise exception using
      errcode = 'check_violation',
      message = 'Please wait before sending another letter.';
  end if;

  if exists (
    select 1
      from public.snail_mail_letters l
     where l.sender_id = new.sender_id
       and l.recipient_id = new.recipient_id
       and l.cancelled_at is null
       and l.delivered_at is not null
       and l.recipient_read_at is null
  ) then
    raise exception using
      errcode = 'check_violation',
      message = 'Please wait before sending another letter.';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_snail_mail_pair_limit() from public, anon, authenticated;
