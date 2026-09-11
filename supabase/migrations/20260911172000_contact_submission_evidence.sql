-- Immutable Contact submission evidence captured when mailbox verification succeeds.
-- Existing verified tickets are backfilled explicitly as backfill_existing_ticket.

create table if not exists public.contact_submission_evidence (
  ticket_id uuid primary key references public.support_tickets(id) on delete cascade,
  snapshot_version integer not null check (snapshot_version = 1),
  capture_source text not null check (capture_source in ('verification_capture','backfill_existing_ticket')),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  captured_at timestamptz not null default now()
);

alter table public.contact_submission_evidence enable row level security;
revoke all on table public.contact_submission_evidence from public, anon, authenticated;

create or replace function public.protect_contact_submission_evidence()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'Contact submission evidence is immutable';
  end if;
  if tg_op = 'DELETE' and coalesce(current_setting('app.allow_contact_evidence_delete', true), '') <> '1' then
    raise exception 'Contact submission evidence can only be removed by the retention purge';
  end if;
  return old;
end;
$$;

drop trigger if exists contact_submission_evidence_immutable on public.contact_submission_evidence;
create trigger contact_submission_evidence_immutable
before update or delete on public.contact_submission_evidence
for each row execute function public.protect_contact_submission_evidence();

create or replace function public.verify_public_contact_submission(
  p_submission_id uuid,
  p_token_hash text,
  p_verification_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
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
  if pending.verified_at is not null then return pending.ticket_id; end if;
  if pending.expires_at < now() then raise exception 'Verification link has expired'; end if;
  if pending.token_hash <> lower(btrim(coalesce(p_token_hash, ''))) then raise exception 'Verification link is invalid'; end if;

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
$$;

revoke all on function public.verify_public_contact_submission(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.verify_public_contact_submission(uuid,text,jsonb) to service_role;

-- One-time integrity baseline for already verified Contact tickets. These rows
-- are deliberately distinguished from evidence captured at verification time.
insert into public.contact_submission_evidence(ticket_id, snapshot_version, capture_source, snapshot, sha256, captured_at)
select source.ticket_id, 1, 'backfill_existing_ticket', source.snapshot,
       encode(extensions.digest(convert_to(source.snapshot::text, 'UTF8'), 'sha256'), 'hex'), now()
from (
  select t.id as ticket_id,
         jsonb_build_object(
           'schema_version', 1,
           'capture_source', 'backfill_existing_ticket',
           'ticket_id', t.id,
           'submission', jsonb_build_object(
             'name', t.contact_name,
             'email', t.contact_email,
             'category', t.category,
             'subject', t.subject,
             'message', first_message.body,
             'request_metadata', t.contact_request_metadata,
             'submitted_at', t.created_at
           ),
           'verification', jsonb_build_object(
             'verified_at', t.contact_request_metadata->>'email_verified_at',
             'same_network_client', t.contact_request_metadata->'verification_same_client',
             'provenance_note', 'Reconstructed from the existing verified Contact ticket; not captured contemporaneously.'
           )
         ) as snapshot
    from public.support_tickets t
    left join lateral (
      select m.body from public.support_ticket_messages m
       where m.ticket_id = t.id and not m.is_internal and m.author_id is null
       order by m.created_at asc limit 1
    ) first_message on true
   where t.ticket_type = 'public_contact'
) source
on conflict (ticket_id) do nothing;

create or replace function public.staff_get_contact_submission_integrity(ticket_uuid uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, public
as $$
declare
  evidence public.contact_submission_evidence%rowtype;
  recomputed text;
begin
  if not public.is_moderator() then raise exception 'Moderator authorization required'; end if;
  if not exists (select 1 from public.support_tickets t where t.id = ticket_uuid and t.ticket_type = 'public_contact') then
    raise exception 'Contact ticket not found';
  end if;
  select * into evidence from public.contact_submission_evidence where ticket_id = ticket_uuid;
  if not found then return null; end if;
  recomputed := encode(extensions.digest(convert_to(evidence.snapshot::text, 'UTF8'), 'sha256'), 'hex');
  return jsonb_build_object(
    'snapshot_version', evidence.snapshot_version,
    'capture_source', evidence.capture_source,
    'captured_at', evidence.captured_at,
    'sha256', evidence.sha256,
    'integrity_verified', recomputed = evidence.sha256
  );
end;
$$;

revoke all on function public.staff_get_contact_submission_integrity(uuid) from public, anon, authenticated;
grant execute on function public.staff_get_contact_submission_integrity(uuid) to authenticated;

-- Retention purge is the only path allowed to cascade-delete immutable Contact evidence.
create or replace function public.purge_retained_data()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  policy_row record;
  cutoff timestamptz;
  affected integer;
  removed_audit integer := 0;
  removed_evidence integer := 0;
  removed_reports integer := 0;
  removed_auth integer := 0;
  removed_contacts integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' and current_user <> 'service_role' and not public.is_admin() then
    raise exception 'Administrator authorization required';
  end if;
  perform set_config('app.allow_moderation_audit_mutation', '1', true);
  perform set_config('app.allow_contact_evidence_delete', '1', true);

  for policy_row in select category, retention_period from public.data_retention_policies where enabled and retention_period is not null
  loop
    cutoff := now() - policy_row.retention_period;
    if policy_row.category = 'moderation_audit' then
      delete from public.moderation_audit_log a where a.created_at < cutoff and not exists (
        select 1 from public.data_retention_holds h where h.category = policy_row.category and h.released_at is null
          and h.started_at <= now() and (h.record_id is null or h.record_id = a.id)
      );
      get diagnostics affected = row_count; removed_audit := removed_audit + affected;
    elsif policy_row.category = 'moderation_evidence' then
      delete from public.profile_moderation_evidence e where e.created_at < cutoff and not exists (
        select 1 from public.data_retention_holds h where h.category = policy_row.category and h.released_at is null
          and h.started_at <= now() and (h.record_id is null or h.record_id = e.id)
      );
      get diagnostics affected = row_count; removed_evidence := removed_evidence + affected;
      delete from public.reports r where r.redacted_at is not null and r.created_at < cutoff and not exists (
        select 1 from public.data_retention_holds h where h.category = policy_row.category and h.released_at is null
          and h.started_at <= now() and (h.record_id is null or h.record_id = r.id)
      );
      get diagnostics affected = row_count; removed_reports := removed_reports + affected;
    elsif policy_row.category = 'contact_evidence' then
      delete from public.support_tickets t
       where t.ticket_type = 'public_contact'
         and t.status = 'resolved'
         and coalesce(t.resolved_at, t.updated_at) < cutoff
         and not exists (
           select 1 from public.data_retention_holds h
            where h.category = 'contact_evidence' and h.released_at is null and h.started_at <= now()
              and (h.record_id is null or h.record_id = t.id)
         );
      get diagnostics affected = row_count; removed_contacts := removed_contacts + affected;
    elsif policy_row.category = 'auth_security' then
      removed_auth := removed_auth;
    end if;
  end loop;

  return jsonb_build_object(
    'moderation_audit', removed_audit,
    'moderation_evidence', removed_evidence,
    'redacted_reports', removed_reports,
    'auth_security', removed_auth,
    'contact_evidence', removed_contacts,
    'auth_security_note', 'Provider-managed auth audit entries were not modified.'
  );
end;
$$;
