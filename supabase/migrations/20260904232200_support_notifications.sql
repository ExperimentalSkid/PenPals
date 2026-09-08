-- Route Support Inbox activity through the existing notification stream.
-- Staff receive queue activity; requesters receive public replies and lifecycle
-- updates. Internal notes never create notifications.

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'new_introduction',
    'introduction_replied',
    'introduction_declined',
    'new_message',
    'photo_access_request',
    'photo_access_granted',
    'photo_access_revoked',
    'support_ticket_created',
    'support_ticket_user_reply',
    'support_ticket_public_reply',
    'support_ticket_resolved',
    'support_ticket_reopened'
  ));

create or replace function public.notify_support_ticket()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  requester uuid;
  staff_id uuid;
begin
  if tg_op = 'INSERT' then
    -- A new ticket is a queue event for every active moderator/admin. The
    -- Support Inbox remains the source of truth for the actual queue count.
    for staff_id in
      select p.id
        from public.profiles p
       where p.role in ('moderator', 'admin')
         and p.deactivated_at is null
    loop
      insert into public.notifications(user_id, type, related_id)
      values (staff_id, 'support_ticket_created', new.id)
      on conflict do nothing;
    end loop;
    return new;
  end if;

  if new.status is distinct from old.status then
    select t.requester_id into requester
      from public.support_tickets t
     where t.id = new.id;

    if requester is not null and new.status = 'resolved' then
      insert into public.notifications(user_id, type, related_id)
      values (requester, 'support_ticket_resolved', new.id)
      on conflict do nothing;
    elsif requester is not null
      and old.status = 'resolved'
      and new.status = 'open' then
      insert into public.notifications(user_id, type, related_id)
      values (requester, 'support_ticket_reopened', new.id)
      on conflict do nothing;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.notify_support_ticket_message()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  requester uuid;
  assignee uuid;
  staff_id uuid;
begin
  -- Internal notes are deliberately staff-only and never notify either side.
  if new.is_internal then
    return new;
  end if;

  select t.requester_id, t.assigned_staff_id
    into requester, assignee
    from public.support_tickets t
   where t.id = new.ticket_id;

  if requester is null then
    return new;
  end if;

  if new.author_id = requester then
    -- Prefer the current owner; unassigned tickets notify the active staff
    -- pool so the queue does not depend on a particular browser being open.
    if assignee is not null and exists (
      select 1 from public.profiles p
       where p.id = assignee
         and p.role in ('moderator', 'admin')
         and p.deactivated_at is null
    ) then
      insert into public.notifications(user_id, type, related_id)
      values (assignee, 'support_ticket_user_reply', new.ticket_id)
      on conflict do nothing;
    else
      for staff_id in
        select p.id
          from public.profiles p
         where p.role in ('moderator', 'admin')
           and p.deactivated_at is null
      loop
        insert into public.notifications(user_id, type, related_id)
        values (staff_id, 'support_ticket_user_reply', new.ticket_id)
        on conflict do nothing;
      end loop;
    end if;
  else
    -- Every non-internal staff-authored message is visible to the requester.
    insert into public.notifications(user_id, type, related_id)
    values (requester, 'support_ticket_public_reply', new.ticket_id)
    on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists support_tickets_notifications on public.support_tickets;
create trigger support_tickets_notifications
  after insert or update of status on public.support_tickets
  for each row execute function public.notify_support_ticket();

drop trigger if exists support_ticket_messages_notifications on public.support_ticket_messages;
create trigger support_ticket_messages_notifications
  after insert on public.support_ticket_messages
  for each row execute function public.notify_support_ticket_message();

revoke all on function public.notify_support_ticket() from public, anon, authenticated;
revoke all on function public.notify_support_ticket_message() from public, anon, authenticated;
