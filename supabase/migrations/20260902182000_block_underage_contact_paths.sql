-- Legacy conversations cannot be used to bypass the age gate.  New profiles
-- are protected by the birth-date trigger; these checks also cover any rows
-- that predate the gate.
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
begin
  perform public.expire_introductions();
  if me is null
     or not public.is_adult_birth_date((select birth_date from public.profiles where id = me))
     or char_length(body) = 0
     or char_length(body) > 2000
     or exists (select 1 from public.profiles where id = me and deactivated_at is not null) then
    raise exception 'Invalid reply';
  end if;
  select * into intro from public.conversation_introductions where id = introduction_id for update;
  if intro.id is null or intro.recipient_id <> me or intro.status <> 'pending' or intro.expires_at <= now() then
    raise exception 'Introduction is no longer available';
  end if;
  if not public.is_adult_birth_date((select birth_date from public.profiles where id = intro.sender_id)) then
    raise exception 'Conversation unavailable';
  end if;
  if exists (select 1 from public.profiles where id in (intro.sender_id, intro.recipient_id) and deactivated_at is not null) then
    raise exception 'Conversation unavailable';
  end if;
  if exists (select 1 from public.profile_blocks where (blocker_id = me and blocked_id = intro.sender_id) or (blocker_id = intro.sender_id and blocked_id = me)) then
    raise exception 'Conversation unavailable';
  end if;
  a := least(me, intro.sender_id);
  b := greatest(me, intro.sender_id);
  perform pg_advisory_xact_lock(hashtextextended(a::text || b::text, 0));
  select d.conversation_id into existing_conversation_id from public.direct_conversation_pairs d where d.user_a = a and d.user_b = b;
  if existing_conversation_id is null then
    insert into public.conversations default values returning id into existing_conversation_id;
    insert into public.direct_conversation_pairs(user_a, user_b, conversation_id) values (a, b, existing_conversation_id) on conflict (user_a, user_b) do nothing;
    select d.conversation_id into existing_conversation_id from public.direct_conversation_pairs d where d.user_a = a and d.user_b = b;
  end if;
  if not exists (select 1 from public.conversation_participants cp where cp.conversation_id = existing_conversation_id and cp.user_id = me) then
    insert into public.conversation_participants(conversation_id, user_id, last_read_at)
      values (existing_conversation_id, intro.sender_id, null), (existing_conversation_id, intro.recipient_id, now()) on conflict do nothing;
  end if;
  insert into public.messages(conversation_id, sender_id, body)
    values (existing_conversation_id, intro.sender_id, intro.icebreaker), (existing_conversation_id, me, body);
  update public.conversation_introductions set status = 'replied', conversation_id_legacy = existing_conversation_id where id = introduction_id;
  return existing_conversation_id;
end;
$$;

revoke all on function public.reply_to_introduction(uuid, text) from public, anon;
grant execute on function public.reply_to_introduction(uuid, text) to authenticated;

drop policy if exists "Participants send active unblocked messages" on public.messages;
create policy "Participants send active adult unblocked messages" on public.messages
for insert to authenticated
with check (
  sender_id = auth.uid()
  and public.is_conversation_participant(conversation_id)
  and public.is_adult_birth_date((select birth_date from public.profiles where id = auth.uid()))
  and not exists (select 1 from public.profiles where id = auth.uid() and deactivated_at is not null)
  and not exists (
    select 1 from public.conversation_participants p
    join public.profile_blocks b on (b.blocker_id = auth.uid() and b.blocked_id = p.user_id) or (b.blocker_id = p.user_id and b.blocked_id = auth.uid())
    where p.conversation_id = messages.conversation_id and p.user_id <> auth.uid()
  )
);
