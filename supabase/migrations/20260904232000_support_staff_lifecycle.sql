-- Staff-side support lifecycle actions. Public replies and internal notes use
-- separate RPCs so the visibility boundary is explicit at the database layer.

create or replace function public.staff_claim_support_ticket(ticket_uuid uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid := auth.uid();
  current_assignee uuid;
begin
  if me is null or not public.is_moderator() then
    raise exception 'Moderator authorization required';
  end if;
  if exists (select 1 from public.profiles where id = me and deactivated_at is not null) then
    raise exception 'Account unavailable';
  end if;

  select t.assigned_staff_id into current_assignee
    from public.support_tickets t
   where t.id = ticket_uuid
   for update;
  if not found then
    raise exception 'Support ticket not found';
  end if;
  if current_assignee is not null and current_assignee <> me then
    raise exception 'Support ticket is assigned to another staff member';
  end if;

  update public.support_tickets
     set assigned_staff_id = me
   where id = ticket_uuid;
  return me;
end;
$$;

create or replace function public.staff_release_support_ticket(ticket_uuid uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid := auth.uid();
  current_assignee uuid;
begin
  if me is null or not public.is_moderator() then
    raise exception 'Moderator authorization required';
  end if;

  select t.assigned_staff_id into current_assignee
    from public.support_tickets t
   where t.id = ticket_uuid
   for update;
  if not found then
    raise exception 'Support ticket not found';
  end if;
  if current_assignee is not null and current_assignee <> me and not public.is_admin() then
    raise exception 'Only the assigned staff member or an administrator can release this ticket';
  end if;

  update public.support_tickets
     set assigned_staff_id = null
   where id = ticket_uuid;
  return true;
end;
$$;

create or replace function public.staff_reply_to_support_ticket(
  ticket_uuid uuid,
  p_body text,
  p_submission_token uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid := auth.uid();
  clean_body text := btrim(coalesce(p_body, ''));
  message_id uuid;
  current_assignee uuid;
  current_status text;
begin
  if me is null or not public.is_moderator() then
    raise exception 'Moderator authorization required';
  end if;
  if p_submission_token is null then
    raise exception 'Reply submission token required';
  end if;
  if char_length(clean_body) < 1 or char_length(clean_body) > 4000 then
    raise exception 'Support reply must be 1 to 4000 characters';
  end if;

  select t.assigned_staff_id, t.status into current_assignee, current_status
    from public.support_tickets t
   where t.id = ticket_uuid
   for update;
  if not found then
    raise exception 'Support ticket not found';
  end if;
  if current_assignee is not null and current_assignee <> me and not public.is_admin() then
    raise exception 'Claim this support ticket before replying';
  end if;
  if current_status = 'resolved' then
    raise exception 'Resolved support tickets must be reopened before replying';
  end if;

  select m.id into message_id
    from public.support_ticket_messages m
   where m.ticket_id = ticket_uuid
     and m.author_id = me
     and m.submission_token = p_submission_token;
  if message_id is not null then
    return message_id;
  end if;

  insert into public.support_ticket_messages (ticket_id, author_id, body, is_internal, submission_token)
  values (ticket_uuid, me, clean_body, false, p_submission_token)
  on conflict (ticket_id, author_id, submission_token) where submission_token is not null do nothing
  returning id into message_id;

  if message_id is null then
    select m.id into message_id
      from public.support_ticket_messages m
     where m.ticket_id = ticket_uuid
       and m.author_id = me
       and m.submission_token = p_submission_token;
  end if;
  if message_id is null then
    raise exception 'Support reply could not be saved';
  end if;

  update public.support_tickets
     set status = 'waiting_user', resolved_at = null
   where id = ticket_uuid
     and status <> 'resolved';
  return message_id;
end;
$$;

create or replace function public.staff_add_support_ticket_note(ticket_uuid uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid := auth.uid();
  clean_body text := btrim(coalesce(p_body, ''));
  note_id uuid;
  current_assignee uuid;
begin
  if me is null or not public.is_moderator() then
    raise exception 'Moderator authorization required';
  end if;
  if char_length(clean_body) < 1 or char_length(clean_body) > 4000 then
    raise exception 'Internal note must be 1 to 4000 characters';
  end if;

  select t.assigned_staff_id into current_assignee
    from public.support_tickets t
   where t.id = ticket_uuid
   for update;
  if not found then
    raise exception 'Support ticket not found';
  end if;
  if current_assignee is not null and current_assignee <> me and not public.is_admin() then
    raise exception 'Claim this support ticket before adding an internal note';
  end if;

  insert into public.support_ticket_messages (ticket_id, author_id, body, is_internal)
  values (ticket_uuid, me, clean_body, true)
  returning id into note_id;
  return note_id;
end;
$$;

create or replace function public.staff_set_support_ticket_status(ticket_uuid uuid, new_status text)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid := auth.uid();
  clean_status text := lower(btrim(coalesce(new_status, '')));
  current_assignee uuid;
  current_status text;
begin
  if me is null or not public.is_moderator() then
    raise exception 'Moderator authorization required';
  end if;
  if clean_status not in ('open', 'waiting_staff', 'waiting_user', 'resolved') then
    raise exception 'Invalid support ticket status';
  end if;

  select t.assigned_staff_id, t.status into current_assignee, current_status
    from public.support_tickets t
   where t.id = ticket_uuid
   for update;
  if not found then
    raise exception 'Support ticket not found';
  end if;
  if current_assignee is not null and current_assignee <> me and not public.is_admin() then
    raise exception 'Claim this support ticket before changing its status';
  end if;
  if current_status = 'resolved' and clean_status <> 'open' then
    raise exception 'Resolved support tickets can only be reopened as open';
  end if;

  update public.support_tickets
     set status = clean_status,
         resolved_at = case when clean_status = 'resolved' then now() else null end
   where id = ticket_uuid;
  return clean_status;
end;
$$;

revoke all on function public.staff_claim_support_ticket(uuid) from public, anon, authenticated;
revoke all on function public.staff_release_support_ticket(uuid) from public, anon, authenticated;
revoke all on function public.staff_reply_to_support_ticket(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.staff_add_support_ticket_note(uuid, text) from public, anon, authenticated;
revoke all on function public.staff_set_support_ticket_status(uuid, text) from public, anon, authenticated;
grant execute on function public.staff_claim_support_ticket(uuid) to authenticated;
grant execute on function public.staff_release_support_ticket(uuid) to authenticated;
grant execute on function public.staff_reply_to_support_ticket(uuid, text, uuid) to authenticated;
grant execute on function public.staff_add_support_ticket_note(uuid, text) to authenticated;
grant execute on function public.staff_set_support_ticket_status(uuid, text) to authenticated;
