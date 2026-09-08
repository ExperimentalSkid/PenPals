-- Handled introduction requests are no longer actionable notifications.
-- Keep the notification row for retention/export, but mark it read when the
-- recipient replies or declines so it leaves the active notification stream.
create or replace function public.notify_introduction()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.notifications(user_id, type, related_id)
    values (new.recipient_id, 'new_introduction', new.id)
    on conflict do nothing;
  elsif new.status = 'replied' then
    update public.notifications
       set read_at = coalesce(read_at, now())
     where user_id = new.recipient_id
       and type = 'new_introduction'
       and related_id = new.id
       and read_at is null;
    insert into public.notifications(user_id, type, related_id)
    values (new.sender_id, 'introduction_replied', new.id)
    on conflict do nothing;
  elsif new.status = 'declined' then
    update public.notifications
       set read_at = coalesce(read_at, now())
     where user_id = new.recipient_id
       and type = 'new_introduction'
       and related_id = new.id
       and read_at is null;
    insert into public.notifications(user_id, type, related_id)
    values (new.sender_id, 'introduction_declined', new.id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

-- Keep the app-shell badge aligned with the Notifications page, including
-- legacy unread rows whose introduction was already handled before this fix.
create or replace function public.unread_notification_count()
returns bigint
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select case when public.is_email_verified() then count(*) else 0 end
    from public.notifications n
   where n.user_id = auth.uid()
     and n.read_at is null
     and n.type in (
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
       'support_ticket_reopened',
       'profile_verification_reverify'
     )
     and (
       n.type <> 'new_introduction'
       or exists (
         select 1
           from public.conversation_introductions i
          where i.id = n.related_id
            and i.recipient_id = n.user_id
            and i.status = 'pending'
       )
     );
$$;

revoke all on function public.notify_introduction() from public, anon, authenticated;
revoke all on function public.unread_notification_count() from public, anon, authenticated;
grant execute on function public.unread_notification_count() to authenticated;
