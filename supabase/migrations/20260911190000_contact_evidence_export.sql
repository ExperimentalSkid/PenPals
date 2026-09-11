-- Admin-only source bundle for sealed Contact investigation exports.
-- Package assembly and attachment hashing happen in the application; this RPC
-- provides one consistent, privileged evidence projection and records that the
-- immutable snapshot was accessed for export preparation.

create or replace function public.admin_get_contact_export_bundle(ticket_uuid uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  result jsonb;
  investigation_id uuid;
  evidence public.contact_submission_evidence%rowtype;
  recomputed_hash text;
begin
  if not public.is_admin() then raise exception 'Administrator authorization required'; end if;

  select i.id into investigation_id
    from public.contact_investigations i
   where i.ticket_id = ticket_uuid;
  if investigation_id is null then raise exception 'Contact investigation required for evidence export'; end if;

  select * into evidence
    from public.contact_submission_evidence e
   where e.ticket_id = ticket_uuid;
  if not found then raise exception 'Immutable Contact evidence is unavailable'; end if;

  recomputed_hash := encode(extensions.digest(convert_to(evidence.snapshot::text, 'UTF8'), 'sha256'), 'hex');
  if recomputed_hash <> evidence.sha256 then raise exception 'Contact evidence integrity check failed'; end if;

  perform public.record_contact_evidence_audit(
    ticket_uuid,
    'contact_evidence_viewed',
    null,
    jsonb_build_object('context', 'export_preparation', 'investigation_id', investigation_id, 'sha256', evidence.sha256)
  );

  select jsonb_build_object(
    'ticket', jsonb_build_object(
      'id', t.id,
      'ticket_number', t.ticket_number,
      'ticket_code', 'CON-' || t.ticket_number,
      'ticket_type', t.ticket_type,
      'subject', t.subject,
      'category', t.category,
      'status', t.status,
      'priority', t.priority,
      'contact_name', t.contact_name,
      'contact_email', t.contact_email,
      'contact_request_metadata', t.contact_request_metadata,
      'assigned_staff_id', t.assigned_staff_id,
      'created_at', t.created_at,
      'updated_at', t.updated_at,
      'resolved_at', t.resolved_at
    ),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'author_id', m.author_id,
        'author_name', coalesce(p.display_name, p.username, case when m.author_id is null then 'Public contact' else 'Former account' end),
        'body', m.body,
        'is_internal', m.is_internal,
        'created_at', m.created_at
      ) order by m.created_at, m.id)
      from public.support_ticket_messages m
      left join public.profiles p on p.id = m.author_id
      where m.ticket_id = t.id
    ), '[]'::jsonb),
    'attachments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'uploaded_by', a.uploaded_by,
        'storage_path', a.storage_path,
        'file_name', a.file_name,
        'mime_type', a.mime_type,
        'size_bytes', a.size_bytes,
        'created_at', a.created_at
      ) order by a.created_at, a.id)
      from public.support_ticket_attachments a
      where a.ticket_id = t.id
    ), '[]'::jsonb),
    'evidence', jsonb_build_object(
      'snapshot_version', evidence.snapshot_version,
      'capture_source', evidence.capture_source,
      'snapshot', evidence.snapshot,
      'sha256', evidence.sha256,
      'recomputed_sha256', recomputed_hash,
      'integrity_verified', true,
      'captured_at', evidence.captured_at
    ),
    'investigation', (
      select jsonb_build_object(
        'id', i.id,
        'ticket_id', i.ticket_id,
        'status', i.status,
        'reason', i.reason,
        'created_by', i.created_by,
        'created_at', i.created_at,
        'updated_at', i.updated_at,
        'resolved_at', i.resolved_at
      ) from public.contact_investigations i where i.id = investigation_id
    ),
    'retention_holds', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', h.id,
        'category', h.category,
        'record_id', h.record_id,
        'reason', h.reason,
        'authorized_by', h.authorized_by,
        'started_at', h.started_at,
        'released_at', h.released_at
      ) order by h.started_at, h.id)
      from public.data_retention_holds h
      where h.category = 'contact_evidence' and (h.record_id = t.id or h.record_id is null)
    ), '[]'::jsonb),
    'audit', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'actor_id', a.moderator_id,
        'action', a.action,
        'old_status', a.old_status,
        'new_status', a.new_status,
        'metadata', a.metadata,
        'created_at', a.created_at
      ) order by a.created_at, a.id)
      from public.moderation_audit_log a
      where a.metadata->>'ticket_id' = t.id::text
         or (a.metadata->>'category' = 'contact_evidence' and a.metadata->>'record_id' = t.id::text)
    ), '[]'::jsonb)
  ) into result
  from public.support_tickets t
  where t.id = ticket_uuid and t.ticket_type = 'public_contact';

  if result is null then raise exception 'Contact ticket not found'; end if;
  return result;
end;
$$;

revoke all on function public.admin_get_contact_export_bundle(uuid) from public, anon, authenticated;
grant execute on function public.admin_get_contact_export_bundle(uuid) to authenticated;
