-- The initial ticket description is stored as a public message too, but it is
-- already represented by support_ticket_created. Only later requester
-- messages should create support_ticket_user_reply notifications.

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
    -- The first public message is the ticket description and is covered by
    -- notify_support_ticket's support_ticket_created event.
    if not exists (
      select 1
        from public.support_ticket_messages m
       where m.ticket_id = new.ticket_id
         and m.id <> new.id
    ) then
      return new;
    end if;

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
    insert into public.notifications(user_id, type, related_id)
    values (requester, 'support_ticket_public_reply', new.ticket_id)
    on conflict do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.notify_support_ticket_message() from public, anon, authenticated;
