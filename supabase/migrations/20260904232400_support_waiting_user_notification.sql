-- Notify the requester when staff explicitly asks for user attention without
-- sending a public reply. Public replies already create their own event.

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
    'support_ticket_waiting_user',
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
    elsif requester is not null
      and new.status = 'waiting_user'
      and not exists (
        select 1
          from public.support_ticket_messages m
         where m.ticket_id = new.id
           and not m.is_internal
           and m.author_id is distinct from requester
           and m.created_at >= old.updated_at
      ) then
      insert into public.notifications(user_id, type, related_id)
      values (requester, 'support_ticket_waiting_user', new.id)
      on conflict do nothing;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.notify_support_ticket() from public, anon, authenticated;
