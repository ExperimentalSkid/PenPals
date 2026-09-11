-- Require the original verification token even for idempotent replay of an already-verified Contact submission.

CREATE OR REPLACE FUNCTION public.verify_public_contact_submission(p_submission_id uuid, p_token_hash text, p_verification_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  pending public.public_contact_pending_verifications%rowtype;
  new_ticket_id uuid;
  verification_metadata jsonb := coalesce(p_verification_metadata, '{}'::jsonb);
  prior_email bigint := 0;
  prior_client bigint := 0;
  prior_ip bigint := 0;
  verified_at_value timestamptz := now();
  evidence_snapshot jsonb;
  evidence_hash text;
begin
  if jsonb_typeof(verification_metadata) <> 'object' then raise exception 'Invalid verification metadata'; end if;
  select * into pending from public.public_contact_pending_verifications where id = p_submission_id for update;
  if not found then raise exception 'Verification link is invalid'; end if;
  if pending.token_hash <> lower(btrim(coalesce(p_token_hash, ''))) then raise exception 'Verification link is invalid'; end if;
  if pending.verified_at is not null then return pending.ticket_id; end if;
  if pending.expires_at < now() then raise exception 'Verification link has expired'; end if;

  select count(*) into prior_email from public.support_tickets t
   where t.ticket_type = 'public_contact' and lower(t.contact_email) = lower(pending.contact_email);
  select count(*) into prior_client from public.support_tickets t
   where t.ticket_type = 'public_contact' and pending.request_metadata->>'client_key_hash' is not null
     and t.contact_request_metadata->>'client_key_hash' = pending.request_metadata->>'client_key_hash';
  select count(*) into prior_ip from public.support_tickets t
   where t.ticket_type = 'public_contact' and pending.request_metadata->>'ip_hash' is not null
     and t.contact_request_metadata->>'ip_hash' = pending.request_metadata->>'ip_hash';

  insert into public.support_tickets(ticket_type, subject, requester_id, contact_name, contact_email, contact_request_metadata, category, status, priority)
  values(
    'public_contact', pending.subject, null, pending.contact_name, pending.contact_email,
    jsonb_strip_nulls(pending.request_metadata || jsonb_build_object(
      'email_verified', true,
      'email_verified_at', verified_at_value,
      'verification_client_key_hash', verification_metadata->>'client_key_hash',
      'verification_ip', verification_metadata->>'ip',
      'verification_user_agent', verification_metadata->>'user_agent',
      'verification_cf_country', verification_metadata->>'cf_country',
      'verification_cf_ray', verification_metadata->>'cf_ray',
      'verification_same_client', case when pending.request_metadata->>'client_key_hash' is null then null else pending.request_metadata->>'client_key_hash' = verification_metadata->>'client_key_hash' end,
      'prior_verified_email_count', prior_email,
      'prior_verified_client_count', prior_client,
      'prior_verified_ip_count', prior_ip
    )),
    pending.category, 'open', 'normal'
  ) returning id into new_ticket_id;

  insert into public.support_ticket_messages(ticket_id, author_id, body, is_internal)
  values(new_ticket_id, null, pending.message, false);

  evidence_snapshot := jsonb_build_object(
    'schema_version', 1,
    'capture_source', 'verification_capture',
    'ticket_id', new_ticket_id,
    'submission', jsonb_build_object(
      'name', pending.contact_name,
      'email', pending.contact_email,
      'category', pending.category,
      'subject', pending.subject,
      'message', pending.message,
      'request_metadata', pending.request_metadata,
      'submitted_at', pending.created_at
    ),
    'verification', jsonb_build_object(
      'verified_at', verified_at_value,
      'request_metadata', verification_metadata,
      'same_network_client', case when pending.request_metadata->>'client_key_hash' is null then null else pending.request_metadata->>'client_key_hash' = verification_metadata->>'client_key_hash' end,
      'prior_verified_email_count', prior_email,
      'prior_verified_client_count', prior_client,
      'prior_verified_ip_count', prior_ip
    )
  );
  evidence_hash := encode(extensions.digest(convert_to(evidence_snapshot::text, 'UTF8'), 'sha256'), 'hex');

  insert into public.contact_submission_evidence(ticket_id, snapshot_version, capture_source, snapshot, sha256, captured_at)
  values(new_ticket_id, 1, 'verification_capture', evidence_snapshot, evidence_hash, verified_at_value);

  update public.public_contact_pending_verifications
     set verified_at = verified_at_value, ticket_id = new_ticket_id,
         contact_name = null, contact_email = null, category = null, subject = null, message = null, request_metadata = '{}'::jsonb
   where id = pending.id;
  return new_ticket_id;
end;
$function$;


revoke all on function public.verify_public_contact_submission(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.verify_public_contact_submission(uuid,text,jsonb) to service_role;
