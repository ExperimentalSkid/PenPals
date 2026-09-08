-- User-owned support replies. Reply tokens make retries idempotent while the
-- ticket lock keeps the status transition atomic.

alter table public.support_ticket_messages
  add column if not exists submission_token uuid;

create unique index if not exists support_ticket_messages_submission_token_idx
  on public.support_ticket_messages(ticket_id, author_id, submission_token)
  where submission_token is not null;

create or replace function public.reply_to_support_ticket(
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
  ticket_status text;
begin
  if me is null or not public.is_email_verified() then
    raise exception 'Verified account required';
  end if;

  if char_length(clean_body) < 1 or char_length(clean_body) > 4000 then
    raise exception 'Support reply must be 1 to 4000 characters';
  end if;

  select t.status into ticket_status
    from public.support_tickets t
   where t.id = ticket_uuid
     and t.requester_id = me
   for update;

  if ticket_status is null then
    raise exception 'Support request not found';
  end if;
  if ticket_status = 'resolved' then
    raise exception 'Support request is closed';
  end if;

  if p_submission_token is not null then
    select m.id into message_id
      from public.support_ticket_messages m
     where m.ticket_id = ticket_uuid
       and m.author_id = me
       and m.submission_token = p_submission_token;
    if message_id is not null then
      return message_id;
    end if;
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
     set status = 'waiting_staff',
         resolved_at = null
   where id = ticket_uuid
     and requester_id = me
     and status <> 'resolved';

  return message_id;
end;
$$;

revoke all on function public.reply_to_support_ticket(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.reply_to_support_ticket(uuid, text, uuid) to authenticated;
