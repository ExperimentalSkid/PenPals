-- Snail-Mail-only relationships intentionally do not have a
-- direct_conversation_pairs row.  Check the participant pair as well while
-- accepting an introduction so two opposite pending introductions cannot
-- create duplicate conversations after the first one is accepted.

create or replace function public.reply_to_introduction(introduction_id uuid, reply text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  intro public.conversation_introductions;
  existing_conversation_id uuid;
  me uuid := auth.uid();
  body text := trim(coalesce(reply, ''));
  a uuid;
  b uuid;
  sender_allow_instant boolean;
  sender_allow_snail boolean;
  recipient_allow_instant boolean;
  recipient_allow_snail boolean;
  relationship_mode text;
begin
  if not public.is_email_verified() then
    raise exception 'Email verification required';
  end if;

  perform public.expire_introductions();
  if me is null
     or not public.is_adult_birth_date((select birth_date from public.profiles where id = me))
     or char_length(body) = 0
     or char_length(body) > 2000
     or exists (select 1 from public.profiles where id = me and deactivated_at is not null) then
    raise exception 'Invalid reply';
  end if;

  select *
    into intro
    from public.conversation_introductions
   where id = introduction_id
   for update;

  if intro.id is null
     or intro.recipient_id <> me
     or intro.status <> 'pending'
     or intro.expires_at <= now() then
    raise exception 'Introduction is no longer available';
  end if;
  if not public.is_adult_birth_date((select birth_date from public.profiles where id = intro.sender_id)) then
    raise exception 'Conversation unavailable';
  end if;
  if exists (
    select 1
      from public.profiles
     where id in (intro.sender_id, intro.recipient_id)
       and deactivated_at is not null
  ) then
    raise exception 'Conversation unavailable';
  end if;
  if exists (
    select 1
      from public.profile_blocks
     where (blocker_id = me and blocked_id = intro.sender_id)
        or (blocker_id = intro.sender_id and blocked_id = me)
  ) then
    raise exception 'Conversation unavailable';
  end if;

  select p.allow_instant_messages, p.allow_snail_mail
    into recipient_allow_instant, recipient_allow_snail
    from public.profiles p
   where p.id = intro.recipient_id;
  select p.allow_instant_messages, p.allow_snail_mail
    into sender_allow_instant, sender_allow_snail
    from public.profiles p
   where p.id = intro.sender_id;

  a := least(me, intro.sender_id);
  b := greatest(me, intro.sender_id);
  perform pg_advisory_xact_lock(hashtextextended(a::text || b::text, 0));

  -- Instant relationships are indexed in direct_conversation_pairs, but
  -- Snail-Mail-only relationships are represented only by their participants.
  -- Check both shapes while holding the pair lock before creating anything.
  if exists (
    select 1
      from public.conversation_participants cp
      join public.conversation_participants cp2
        on cp2.conversation_id = cp.conversation_id
     where cp.user_id = me
       and cp2.user_id = intro.sender_id
  ) then
    raise exception 'Conversation already exists';
  end if;

  select d.conversation_id
    into existing_conversation_id
    from public.direct_conversation_pairs d
   where d.user_a = a
     and d.user_b = b;

  if existing_conversation_id is null then
    if coalesce(sender_allow_instant, false) and coalesce(recipient_allow_instant, false) then
      relationship_mode := 'instant';
    elsif coalesce(sender_allow_snail, false) and coalesce(recipient_allow_snail, false) then
      relationship_mode := 'snail_mail';
    else
      raise exception 'Conversation unavailable';
    end if;

    insert into public.conversations(communication_mode)
      values (relationship_mode)
      returning id into existing_conversation_id;

    if relationship_mode = 'instant' then
      insert into public.direct_conversation_pairs(user_a, user_b, conversation_id)
        values (a, b, existing_conversation_id)
        on conflict (user_a, user_b) do nothing;
      select d.conversation_id
        into existing_conversation_id
        from public.direct_conversation_pairs d
       where d.user_a = a
         and d.user_b = b;
    end if;
  else
    select c.communication_mode
      into relationship_mode
      from public.conversations c
     where c.id = existing_conversation_id;
    relationship_mode := coalesce(relationship_mode, 'instant');
  end if;

  if not exists (
    select 1
      from public.conversation_participants cp
     where cp.conversation_id = existing_conversation_id
       and cp.user_id = me
  ) then
    insert into public.conversation_participants(conversation_id, user_id, last_read_at)
      values
        (existing_conversation_id, intro.sender_id, null),
        (existing_conversation_id, intro.recipient_id, now())
      on conflict do nothing;
  end if;

  if relationship_mode = 'snail_mail' then
    insert into public.response_opportunities(conversation_id, initiator_id, recipient_id, created_at, responded_at)
      values (existing_conversation_id, intro.sender_id, intro.recipient_id, intro.created_at, now())
      on conflict (conversation_id) do nothing;
    perform public.send_snail_mail(existing_conversation_id, body, null);
  else
    insert into public.response_opportunities(conversation_id, initiator_id, recipient_id, created_at)
      values (existing_conversation_id, intro.sender_id, intro.recipient_id, intro.created_at)
      on conflict (conversation_id) do nothing;
    insert into public.messages(conversation_id, sender_id, body)
      values
        (existing_conversation_id, intro.sender_id, intro.icebreaker),
        (existing_conversation_id, me, body);
  end if;

  update public.conversation_introductions
     set status = 'replied',
         conversation_id_legacy = existing_conversation_id
   where id = introduction_id;

  return existing_conversation_id;
end;
$$;

revoke all on function public.reply_to_introduction(uuid, text) from public, anon;
grant execute on function public.reply_to_introduction(uuid, text) to authenticated;
