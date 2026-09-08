create or replace function public.realtime_presence_publisher(target uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select target = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.deactivated_at is null);
$$;

create or replace function public.realtime_presence_viewer(target uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select auth.uid() is not null
    and exists (select 1 from public.profiles p where p.id = target and p.deactivated_at is null and (target = auth.uid() or p.show_activity_status = true))
    and not exists (select 1 from public.profile_blocks b where (b.blocker_id = auth.uid() and b.blocked_id = target) or (b.blocked_id = auth.uid() and b.blocker_id = target));
$$;
revoke execute on function public.realtime_presence_publisher(uuid) from public;
revoke execute on function public.realtime_presence_viewer(uuid) from public;
grant execute on function public.realtime_presence_publisher(uuid) to authenticated;
grant execute on function public.realtime_presence_viewer(uuid) to authenticated;

drop policy if exists "Penpal presence publish" on realtime.messages;
drop policy if exists "Penpal presence read" on realtime.messages;

create policy "Penpal presence publish" on realtime.messages
for insert to authenticated with check (
  realtime.messages.extension = 'presence'
  and realtime_presence_publisher((substring(realtime.topic() from '^presence:user:([0-9a-fA-F-]{36})$'))::uuid)
);

create policy "Penpal presence read" on realtime.messages
for select to authenticated using (
  realtime.messages.extension = 'presence'
  and realtime_presence_viewer((substring(realtime.topic() from '^presence:user:([0-9a-fA-F-]{36})$'))::uuid)
);
