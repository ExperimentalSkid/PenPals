-- Presence is carried by private Realtime channels, not persisted in Postgres.
-- These policies ensure only active, visible, mutually-unblocked users can
-- subscribe to another user's presence channel.

drop policy if exists "Penpal presence publish" on realtime.messages;
drop policy if exists "Penpal presence read" on realtime.messages;

create policy "Penpal presence publish"
on realtime.messages
for insert to authenticated
with check (
  realtime.topic() like 'presence:user:%'
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.deactivated_at is null
  )
  and (
    case
      when realtime.topic() ~ '^presence:user:[0-9a-fA-F-]{36}$'
        then (substring(realtime.topic() from '^presence:user:([0-9a-fA-F-]{36})$'))::uuid = auth.uid()
      else false
    end
  )
);

create policy "Penpal presence read"
on realtime.messages
for select to authenticated
using (
  realtime.topic() ~ '^presence:user:[0-9a-fA-F-]{36}$'
  and exists (
    select 1
    from public.profiles target
    where target.id = (substring(realtime.topic() from '^presence:user:([0-9a-fA-F-]{36})$'))::uuid
      and target.deactivated_at is null
      and (
        target.id = auth.uid()
        or target.show_activity_status = true
      )
  )
  and not exists (
    select 1
    from public.profile_blocks b
    where (b.blocker_id = auth.uid() and b.blocked_id = (substring(realtime.topic() from '^presence:user:([0-9a-fA-F-]{36})$'))::uuid)
       or (b.blocked_id = auth.uid() and b.blocker_id = (substring(realtime.topic() from '^presence:user:([0-9a-fA-F-]{36})$'))::uuid)
  )
);
