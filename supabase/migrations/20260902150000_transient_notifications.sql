-- Messages already have their own unread state in conversation participants.
-- They must not create a second notification stream or affect the notification
-- badge. Existing rows remain addressable for migration compatibility but are
-- excluded from the active notification surface and unread count.
drop trigger if exists messages_notifications on public.messages;
drop function if exists public.notify_message();

create or replace function public.unread_notification_count()
returns bigint
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select count(*)
    from public.notifications
   where user_id = auth.uid()
     and read_at is null
     and type <> 'new_message'
$$;

revoke all on function public.unread_notification_count() from public, anon, authenticated;
grant execute on function public.unread_notification_count() to authenticated;
