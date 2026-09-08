drop policy if exists "debug presence" on realtime.messages;
drop policy if exists "Penpal presence publish" on realtime.messages;
drop policy if exists "Penpal presence read" on realtime.messages;

create policy "Penpal presence publish" on realtime.messages
for insert to authenticated with check (
  realtime.topic() ~ '(^|:)presence:user:[0-9a-fA-F-]{36}$'
  and public.realtime_presence_publisher((substring(realtime.topic() from 'presence:user:([0-9a-fA-F-]{36})'))::uuid)
);

create policy "Penpal presence read" on realtime.messages
for select to authenticated using (
  realtime.topic() ~ '(^|:)presence:user:[0-9a-fA-F-]{36}$'
  and public.realtime_presence_viewer((substring(realtime.topic() from 'presence:user:([0-9a-fA-F-]{36})'))::uuid)
);
