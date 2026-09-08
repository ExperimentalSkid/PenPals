-- Close the direct-RPC gap for moderators: mutating a support ticket requires
-- an active self-claim. Administrators retain their existing override.

create or replace function public.staff_support_require_claim(ticket_uuid uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null or not public.is_moderator() then
    raise exception 'Moderator authorization required';
  end if;
  if not public.is_admin() and not exists (
    select 1
      from public.support_tickets t
     where t.id = ticket_uuid
       and t.assigned_staff_id = auth.uid()
  ) then
    raise exception 'Claim this support ticket before taking action';
  end if;
end;
$$;

alter function public.staff_reply_to_support_ticket(uuid, text, uuid) rename to staff_reply_to_support_ticket_unchecked;
alter function public.staff_add_support_ticket_note(uuid, text) rename to staff_add_support_ticket_note_unchecked;
alter function public.staff_set_support_ticket_status(uuid, text) rename to staff_set_support_ticket_status_unchecked;

create or replace function public.staff_reply_to_support_ticket(ticket_uuid uuid, p_body text, p_submission_token uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.staff_support_require_claim(ticket_uuid);
  return public.staff_reply_to_support_ticket_unchecked(ticket_uuid, p_body, p_submission_token);
end;
$$;

create or replace function public.staff_add_support_ticket_note(ticket_uuid uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.staff_support_require_claim(ticket_uuid);
  return public.staff_add_support_ticket_note_unchecked(ticket_uuid, p_body);
end;
$$;

create or replace function public.staff_set_support_ticket_status(ticket_uuid uuid, new_status text)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.staff_support_require_claim(ticket_uuid);
  return public.staff_set_support_ticket_status_unchecked(ticket_uuid, new_status);
end;
$$;

revoke all on function public.staff_support_require_claim(uuid) from public, anon, authenticated;
revoke all on function public.staff_reply_to_support_ticket_unchecked(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.staff_add_support_ticket_note_unchecked(uuid, text) from public, anon, authenticated;
revoke all on function public.staff_set_support_ticket_status_unchecked(uuid, text) from public, anon, authenticated;
revoke all on function public.staff_reply_to_support_ticket(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.staff_add_support_ticket_note(uuid, text) from public, anon, authenticated;
revoke all on function public.staff_set_support_ticket_status(uuid, text) from public, anon, authenticated;
grant execute on function public.staff_reply_to_support_ticket(uuid, text, uuid) to authenticated;
grant execute on function public.staff_add_support_ticket_note(uuid, text) to authenticated;
grant execute on function public.staff_set_support_ticket_status(uuid, text) to authenticated;
