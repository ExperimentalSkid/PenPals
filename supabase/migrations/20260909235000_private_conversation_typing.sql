drop policy if exists "Conversation typing publish" on realtime.messages;
drop policy if exists "Conversation typing read" on realtime.messages;

create policy "Conversation typing publish"
on realtime.messages
for insert
to authenticated
with check (
  realtime.messages.extension = 'broadcast'
  and realtime.topic() ~ '(^|:)typing:conversation:[0-9a-fA-F-]{36}$'
  and public.is_conversation_participant(
    (substring(realtime.topic() from 'typing:conversation:([0-9a-fA-F-]{36})'))::uuid
  )
);

create policy "Conversation typing read"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and realtime.topic() ~ '(^|:)typing:conversation:[0-9a-fA-F-]{36}$'
  and public.is_conversation_participant(
    (substring(realtime.topic() from 'typing:conversation:([0-9a-fA-F-]{36})'))::uuid
  )
);
