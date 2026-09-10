-- Require mailbox control before a public contact submission becomes a staff ticket.
create table if not exists public.public_contact_pending_verifications (
  id uuid primary key default gen_random_uuid(),
  contact_name text,
  contact_email text,
  category text,
  subject text,
  message text,
  request_metadata jsonb not null default '{}'::jsonb,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '1 hour'),
  verified_at timestamptz,
  ticket_id uuid references public.support_tickets(id) on delete set null,
  constraint public_contact_pending_metadata_object check (jsonb_typeof(request_metadata) = 'object'),
  constraint public_contact_pending_token_hash check (token_hash ~ '^[0-9a-f]{64}$')
);

alter table public.public_contact_pending_verifications enable row level security;
revoke all on table public.public_contact_pending_verifications from public, anon, authenticated;

create index if not exists public_contact_pending_email_idx
  on public.public_contact_pending_verifications((lower(contact_email)), created_at desc)
  where contact_email is not null;
create index if not exists public_contact_pending_client_idx
  on public.public_contact_pending_verifications((request_metadata->>'client_key_hash'), created_at desc)
  where request_metadata ? 'client_key_hash';
create index if not exists public_contact_pending_expiry_idx
  on public.public_contact_pending_verifications(expires_at);

create or replace function public.create_public_contact_verification(
  p_name text,
  p_email text,
  p_category text,
  p_subject text,
  p_message text,
  p_token_hash text,
  p_request_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  clean_name text := nullif(btrim(coalesce(p_name, '')), '');
  clean_email text := lower(btrim(coalesce(p_email, '')));
  clean_category text := lower(btrim(coalesce(p_category, '')));
  clean_subject text := btrim(coalesce(p_subject, ''));
  clean_message text := btrim(coalesce(p_message, ''));
  clean_token_hash text := lower(btrim(coalesce(p_token_hash, '')));
  metadata jsonb := coalesce(p_request_metadata, '{}'::jsonb);
  client_hash text;
  pending_id uuid;
begin
  if jsonb_typeof(metadata) <> 'object' then raise exception 'Invalid request metadata'; end if;
  if clean_name is not null and char_length(clean_name) > 120 then raise exception 'Use a shorter name'; end if;
  if clean_email !~* '^[^[:space:]<>@]+@[^[:space:]<>@]+\.[^[:space:]<>@]+$' or char_length(clean_email) > 254 then raise exception 'Enter a valid email address'; end if;
  if clean_category not in ('account_access','privacy_safety','bug_report','feedback','other') then raise exception 'Choose a valid topic'; end if;
  if char_length(clean_subject) < 3 or char_length(clean_subject) > 200 then raise exception 'Subject must be 3 to 200 characters'; end if;
  if char_length(clean_message) < 10 or char_length(clean_message) > 4000 then raise exception 'Message must be 10 to 4000 characters'; end if;
  if clean_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid verification token'; end if;

  delete from public.public_contact_pending_verifications
   where (verified_at is null and expires_at < now() - interval '1 day')
      or (verified_at is not null and verified_at < now() - interval '1 day');

  perform pg_advisory_xact_lock(hashtext('public-contact:' || clean_email));
  client_hash := nullif(metadata->>'client_key_hash', '');

  if exists (
    select 1 from public.public_contact_pending_verifications p
     where lower(p.contact_email) = clean_email and p.created_at > now() - interval '1 minute' and p.verified_at is null
  ) or exists (
    select 1 from public.support_tickets t
     where t.ticket_type = 'public_contact' and lower(t.contact_email) = clean_email and t.created_at > now() - interval '1 minute'
  ) then raise exception 'Please wait before sending another message'; end if;

  if (
    (select count(*) from public.public_contact_pending_verifications p where lower(p.contact_email) = clean_email and p.created_at > now() - interval '24 hours')
    + (select count(*) from public.support_tickets t where t.ticket_type = 'public_contact' and lower(t.contact_email) = clean_email and t.created_at > now() - interval '24 hours')
  ) >= 5 then raise exception 'Please wait before sending another message'; end if;

  if client_hash is not null and (
    (select count(*) from public.public_contact_pending_verifications p where p.request_metadata->>'client_key_hash' = client_hash and p.created_at > now() - interval '24 hours')
    + (select count(*) from public.support_tickets t where t.ticket_type = 'public_contact' and t.contact_request_metadata->>'client_key_hash' = client_hash and t.created_at > now() - interval '24 hours')
  ) >= 10 then raise exception 'Please wait before sending another message'; end if;

  insert into public.public_contact_pending_verifications(contact_name, contact_email, category, subject, message, request_metadata, token_hash)
  values(clean_name, clean_email, clean_category, clean_subject, clean_message, metadata, clean_token_hash)
  returning id into pending_id;
  return pending_id;
end;
$$;

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
      'email_verified_at', now(),
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

  update public.public_contact_pending_verifications
     set verified_at = now(), ticket_id = new_ticket_id,
         contact_name = null, contact_email = null, category = null, subject = null, message = null, request_metadata = '{}'::jsonb
   where id = pending.id;
  return new_ticket_id;
end;
$$;

revoke all on function public.create_public_contact_verification(text,text,text,text,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.verify_public_contact_submission(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.create_public_contact_verification(text,text,text,text,text,text,jsonb) to service_role;
grant execute on function public.verify_public_contact_submission(uuid,text,jsonb) to service_role;

-- Prevent direct anonymous ticket creation from bypassing mailbox verification.
revoke all on function public.submit_public_contact_ticket(text, text, text, text, text, text) from public, anon, authenticated;
