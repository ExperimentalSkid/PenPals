-- Keep the app-shell badge aligned with the actionable Notifications page.
-- Support events are part of the existing notification stream and must count
-- for the owning requester or authorized staff member without exposing any
-- additional notification data.
create or replace function public.unread_notification_count()
returns bigint
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select case when public.is_email_verified() then count(*) else 0 end
    from public.notifications
   where user_id = auth.uid()
     and read_at is null
     and type in (
       'new_introduction',
       'introduction_replied',
       'introduction_declined',
       'photo_access_request',
       'photo_access_granted',
       'support_ticket_created',
       'support_ticket_user_reply',
       'support_ticket_public_reply',
       'support_ticket_waiting_user',
       'support_ticket_resolved',
       'support_ticket_reopened'
     );
$$;

revoke all on function public.unread_notification_count() from public, anon, authenticated;
grant execute on function public.unread_notification_count() to authenticated;
