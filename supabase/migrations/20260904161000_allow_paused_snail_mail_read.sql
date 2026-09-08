-- Pause stops new participation and activity, but existing correspondence
-- remains intact and readable.  Deactivated accounts still cannot use this
-- RPC; the lifecycle states remain distinct.
create or replace function public.mark_snail_mail_read(letter_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null or not public.is_email_verified()
     or exists (select 1 from public.profiles p where p.id = me and p.deactivated_at is not null) then
    raise exception 'Authentication required';
  end if;
  perform 1
    from public.snail_mail_letters l
   where l.id = letter_id
     and l.recipient_id = me
     and l.cancelled_at is null
     and l.deliver_at <= now();
  if not found then
    raise exception 'Letter is not delivered';
  end if;
  perform set_config('app.snail_mail_system_write', '1', true);
  update public.snail_mail_letters
     set delivered_at = coalesce(delivered_at, now()),
         recipient_read_at = coalesce(recipient_read_at, now())
   where id = letter_id
     and recipient_id = me
     and cancelled_at is null;
end;
$$;

revoke all on function public.mark_snail_mail_read(uuid) from public, anon;
grant execute on function public.mark_snail_mail_read(uuid) to authenticated;
