-- Deactivated accounts cannot use the cancellation RPC directly.  Voluntary
-- pause remains a separate state and does not prevent managing an existing
-- letter; this guard only closes the normal-app lifecycle bypass.

create or replace function public.cancel_snail_mail(letter_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid := auth.uid();
  letter_row public.snail_mail_letters%rowtype;
begin
  if me is null or not public.is_email_verified()
     or exists (select 1 from public.profiles p where p.id = me and p.deactivated_at is not null) then
    raise exception 'Authentication required';
  end if;

  select l.* into letter_row
    from public.snail_mail_letters l
   where l.id = letter_id
     and l.sender_id = me
     and exists (
       select 1 from public.conversation_participants cp
        where cp.conversation_id = l.conversation_id and cp.user_id = me
     )
   for update;

  if not found then
    raise exception 'Letter is no longer in transit';
  end if;
  if letter_row.cancelled_at is not null
     or letter_row.delivered_at is not null
     or letter_row.deliver_at <= now() then
    raise exception 'Letter is no longer in transit';
  end if;

  perform set_config('app.snail_mail_cancel_write', '1', true);
  update public.snail_mail_letters
     set cancelled_at = now()
   where id = letter_row.id
     and cancelled_at is null
     and delivered_at is null
     and deliver_at > now();
  if not found then
    raise exception 'Letter is no longer in transit';
  end if;
end;
$$;

revoke all on function public.cancel_snail_mail(uuid) from public, anon;
grant execute on function public.cancel_snail_mail(uuid) to authenticated;
