-- Keep the navigation badge on the same actionable unread stream as the
-- Notifications page. Legacy message rows and reserved/non-actionable types
-- remain stored for compatibility but must not contribute to this count.
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
       'photo_access_granted'
     );
$$;

revoke all on function public.unread_notification_count() from public, anon, authenticated;
grant execute on function public.unread_notification_count() to authenticated;
