-- Contact-evidence audit trail. These privileged events stay in the existing
-- immutable moderation audit log but are intentionally separate from ordinary
-- support-ticket activity.

create or replace function public.record_contact_evidence_audit(
  ticket_uuid uuid,
  event_action text,
  event_reason text default null,
  event_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  clean_action text := lower(btrim(coalesce(event_action, '')));
  clean_reason text := nullif(btrim(coalesce(event_reason, '')), '');
  metadata jsonb := coalesce(event_metadata, '{}'::jsonb);
begin
  if not public.is_admin() then raise exception 'Administrator authorization required'; end if;
  if clean_action not in (
    'contact_evidence_viewed',
    'contact_evidence_preserved',
    'contact_evidence_hold_released',
    'contact_investigation_escalated',
    'contact_export_prepared'
  ) then raise exception 'Unsupported Contact evidence audit event'; end if;
  if not exists (select 1 from public.support_tickets t where t.id = ticket_uuid and t.ticket_type = 'public_contact') then
    raise exception 'Contact ticket not found';
  end if;
  if jsonb_typeof(metadata) <> 'object' then raise exception 'Audit metadata must be an object'; end if;
  if clean_reason is not null and char_length(clean_reason) > 2000 then raise exception 'Audit reason is too long'; end if;
  if clean_action in ('contact_investigation_escalated','contact_export_prepared') and clean_reason is null then
    raise exception 'A reason is required for this Contact evidence event';
  end if;

  insert into public.moderation_audit_log(moderator_id, action, metadata)
  values (
    auth.uid(), clean_action,
    jsonb_strip_nulls(jsonb_build_object(
      'ticket_id', ticket_uuid,
      'reason', clean_reason
    ) || metadata)
  );
end;
$$;

revoke all on function public.record_contact_evidence_audit(uuid,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.record_contact_evidence_audit(uuid,text,text,jsonb) to authenticated;

create or replace function public.admin_preserve_contact_evidence(ticket_uuid uuid, hold_reason text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  hold_id uuid;
begin
  if not public.is_admin() then raise exception 'Administrator authorization required'; end if;
  hold_id := public.set_data_retention_hold('contact_evidence', ticket_uuid, hold_reason);
  perform public.record_contact_evidence_audit(
    ticket_uuid, 'contact_evidence_preserved', hold_reason, jsonb_build_object('hold_id', hold_id)
  );
  return hold_id;
end;
$$;

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

revoke all on function public.admin_preserve_contact_evidence(uuid,text) from public, anon, authenticated;
grant execute on function public.admin_preserve_contact_evidence(uuid,text) to authenticated;
revoke all on function public.admin_release_contact_evidence_hold(uuid,uuid) from public, anon, authenticated;
grant execute on function public.admin_release_contact_evidence_hold(uuid,uuid) to authenticated;

create or replace function public.staff_get_contact_submission_integrity(ticket_uuid uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  evidence public.contact_submission_evidence%rowtype;
  recomputed text;
  integrity_ok boolean;
begin
  if not public.is_moderator() then raise exception 'Moderator authorization required'; end if;
  if not exists (select 1 from public.support_tickets t where t.id = ticket_uuid and t.ticket_type = 'public_contact') then
    raise exception 'Contact ticket not found';
  end if;
  select * into evidence from public.contact_submission_evidence where ticket_id = ticket_uuid;
  if not found then return null; end if;
  recomputed := encode(extensions.digest(convert_to(evidence.snapshot::text, 'UTF8'), 'sha256'), 'hex');
  integrity_ok := recomputed = evidence.sha256;

  insert into public.moderation_audit_log(moderator_id, action, metadata)
  values (auth.uid(), 'contact_evidence_viewed', jsonb_build_object(
    'ticket_id', ticket_uuid,
    'sha256', evidence.sha256,
    'capture_source', evidence.capture_source,
    'snapshot_version', evidence.snapshot_version,
    'integrity_verified', integrity_ok
  ));

  return jsonb_build_object(
    'snapshot_version', evidence.snapshot_version,
    'capture_source', evidence.capture_source,
    'captured_at', evidence.captured_at,
    'sha256', evidence.sha256,
    'integrity_verified', integrity_ok
  );
end;
$$;

revoke all on function public.staff_get_contact_submission_integrity(uuid) from public, anon, authenticated;
grant execute on function public.staff_get_contact_submission_integrity(uuid) to authenticated;
