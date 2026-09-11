-- An active Contact investigation must retain its automatic evidence hold.

create or replace function public.admin_release_contact_evidence_hold(ticket_uuid uuid, hold_uuid uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  hold_reason text;
begin
  if not public.is_admin() then raise exception 'Administrator authorization required'; end if;
  if exists (
    select 1 from public.contact_investigations i
    where i.ticket_id = ticket_uuid and i.status in ('open','investigating')
  ) then
    raise exception 'Resolve the Contact investigation before releasing its evidence hold';
  end if;
  select h.reason into hold_reason
    from public.data_retention_holds h
   where h.id = hold_uuid
     and h.category = 'contact_evidence'
     and h.record_id = ticket_uuid
     and h.released_at is null;
  if not found then raise exception 'Active Contact evidence hold not found for this ticket'; end if;
  perform public.release_data_retention_hold(hold_uuid);
  perform public.record_contact_evidence_audit(
    ticket_uuid, 'contact_evidence_hold_released', hold_reason, jsonb_build_object('hold_id', hold_uuid)
  );
end;
$$;

revoke all on function public.admin_release_contact_evidence_hold(uuid,uuid) from public, anon, authenticated;
grant execute on function public.admin_release_contact_evidence_hold(uuid,uuid) to authenticated;
