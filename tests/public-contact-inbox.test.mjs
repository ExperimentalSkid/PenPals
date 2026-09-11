import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { LOCAL_DB_CONTAINER } from "./helpers/local-db.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("public contact intake reuses support tickets without exposing the tables", async () => {
  const migration = await read("supabase/migrations/20260905460000_public_contact_inbox.sql");

  assert.match(migration, /add column if not exists contact_name text/);
  assert.match(migration, /add column if not exists contact_email text/);
  assert.match(migration, /add column if not exists contact_request_metadata jsonb/);
  assert.match(migration, /create or replace function public\.submit_public_contact_ticket/);
  assert.match(migration, /ticket_type,\s*\n\s*subject,\s*\n\s*requester_id,\s*\n\s*contact_name,\s*\n\s*contact_email/s);
  assert.match(migration, /'public_contact'/);
  assert.match(migration, /public\.support_tickets/);
  assert.match(migration, /public\.support_ticket_messages/);
  assert.match(migration, /grant execute on function public\.submit_public_contact_ticket\(text, text, text, text, text, text\) to anon, authenticated/);
  assert.doesNotMatch(migration, /grant\s+(?:select|insert|update|delete|all)\s+on\s+table\s+public\.support_tickets\s+to\s+(?:anon|authenticated)/i);
});

test("support and public contact queues are separated at the database projection layer", async () => {
  const migration = await read("supabase/migrations/20260905460000_public_contact_inbox.sql");

  assert.match(migration, /create or replace function public\.staff_support_open_count/);
  assert.match(migration, /ticket_type <> 'public_contact'/);
  assert.match(migration, /create or replace function public\.staff_contact_open_count/);
  assert.match(migration, /ticket_type = 'public_contact'/);
  assert.match(migration, /create or replace function public\.staff_list_public_contact_tickets/);
  assert.match(migration, /'CON-' \|\| t\.ticket_number/);
  assert.match(migration, /coalesce\(nullif\(t\.contact_name, ''\), t\.contact_email, 'Public contact'\)/);
  assert.match(migration, /contact_request_metadata->>'client_key_hash'/);
  assert.match(migration, /create or replace function public\.staff_get_support_ticket/);
  assert.match(migration, /'contact'/);
  assert.match(migration, /if not public\.is_moderator\(\)/);
});

test("browser correlation is HMAC-based, versioned, and independent of IP", async () => {
  const helper = await read("src/lib/contact-verification.ts");
  const match = helper.match(/export function createContactBrowserEnvironmentCorrelation[\s\S]*?\n}\n/);
  assert.ok(match, "browser correlation helper is present");
  assert.match(match[0], /createHmac\("sha256"/);
  assert.match(match[0], /CONTACT_CORRELATION_HMAC_SECRET/);
  assert.match(match[0], /CONTACT_BROWSER_CORRELATION_VERSION/);
  assert.match(match[0], /user_agent/);
  assert.match(match[0], /sec_ch_ua_platform/);
  assert.match(match[0], /timezone/);
  assert.match(match[0], /languages/);
  assert.doesNotMatch(match[0], /serverMetadata\.ip|clientMetadata\.ip/);
});

test("public contact UI submits pre-login messages and staff can open a dedicated inbox", async () => {
  const contactPage = await read("src/app/contact/page.tsx");
  const contactAction = await read("src/app/contact/actions.ts");
  const clientMetadataFields = await read("src/app/contact/ContactClientMetadataFields.tsx");
  const contactInbox = await read("src/app/app/admin/contact/page.tsx");
  const supportDetail = await read("src/app/app/admin/support/[id]/page.tsx");
  const abuseContext = await read("src/app/app/admin/support/ContactAbuseContext.tsx");
  const supportActions = await read("src/app/app/admin/support/actions.ts");
  const navigation = await read("src/app/app/AppNavigation.tsx");
  const layout = await read("src/app/app/layout.tsx");

  assert.match(contactPage, /submitPublicContact/);
  for (const field of ["name", "email", "topic", "subject", "message"]) assert.match(contactPage, new RegExp(`name=\\"${field}\\"`));
  assert.doesNotMatch(contactPage, /attachments/);
  assert.match(contactAction, /create_public_contact_verification/);
  assert.match(contactAction, /createContactVerificationToken/);
  assert.match(contactAction, /sendContactVerificationEmail/);
  assert.match(contactAction, /publicContactRequestMetadata/);
  assert.match(contactAction, /request_metadata_version:\s*3/);
  assert.match(contactAction, /client_reported/);
  assert.match(contactAction, /network_client_hash/);
  assert.match(contactAction, /browser_environment_hash/);
  assert.match(contactAction, /createContactBrowserEnvironmentCorrelation/);
  assert.match(contactPage, /ContactClientMetadataFields/);
  for (const field of ["client_timezone", "client_utc_offset_minutes", "client_timestamp_utc", "client_epoch_ms", "client_language", "client_languages"]) {
    assert.match(clientMetadataFields, new RegExp(`name=\\"${field}\\"`));
  }
  assert.match(clientMetadataFields, /Intl\.DateTimeFormat\(\)\.resolvedOptions\(\)/);
  assert.match(clientMetadataFields, /navigator\.languages/);
  assert.match(clientMetadataFields, /getTimezoneOffset/);
  assert.match(contactInbox, /staff_list_public_contact_tickets/);
  assert.match(contactInbox, /Contact Inbox/);
  assert.match(contactInbox, /return_to=\$\{encodeURIComponent\(`\/app\/admin\/contact/);
  assert.match(supportDetail, /Reply by email/);
  assert.match(supportDetail, /Send email reply/);
  assert.match(supportDetail, /Contact Inbox/);
  assert.match(supportDetail, /ContactAbuseContext/);
  assert.match(abuseContext, /Network observations/);
  assert.match(abuseContext, /Client-reported environment/);
  assert.match(abuseContext, /Historical correlation/);
  assert.match(abuseContext, /Timezone \/ offset consistency/);
  assert.match(abuseContext, /Network\/client correlation hash/);
  assert.match(abuseContext, /Browser\/environment correlation hash/);
  assert.match(abuseContext, /browser-reported environment data are correlation signals only/);
  assert.doesNotMatch(abuseContext, /Client fingerprint hash/);
  assert.match(supportActions, /sendPublicContactReplyEmail/);
  assert.match(supportActions, /staff_get_support_ticket/);
  assert.match(navigation, /Contact Inbox/);
  assert.match(navigation, /contactInboxCount/);
  assert.match(layout, /staff_contact_open_count/);
});

test("support email replies use Resend server-side without adding a browser secret", async () => {
  const emailSource = await read("src/lib/email/resend.ts");
  const appConfig = await read("scripts/production-app-config.mjs");
  const envExample = await read(".env.example");

  assert.match(emailSource, /RESEND_API_KEY/);
  assert.match(emailSource, /https:\/\/api\.resend\.com\/emails/);
  assert.match(emailSource, /Authorization/);
  assert.match(emailSource, /Idempotency-Key/);
  assert.match(emailSource, /SUPPORT_EMAIL_FROM/);
  assert.match(emailSource, /SUPPORT_EMAIL_REPLY_TO/);
  assert.match(emailSource, /escapeEmailHtml/);
  assert.doesNotMatch(emailSource, /re_[A-Za-z0-9_]{20,}/);
  assert.match(appConfig, /RESEND_API_KEY/);
  assert.match(appConfig, /SUPPORT_EMAIL_FROM/);
  assert.match(envExample, /SUPPORT_EMAIL_FROM="Pen-Pals <no-reply@pen-pals\.net>"/);
  assert.match(envExample, /SUPPORT_EMAIL_REPLY_TO=/);
});


test("public contact requires email verification before entering the staff queue", async () => {
  const migration = await read("supabase/migrations/20260910152500_public_contact_email_verification.sql");
  const contactAction = await read("src/app/contact/actions.ts");
  const verifyRoute = await read("src/app/contact/verify/route.ts");
  const contactPage = await read("src/app/contact/page.tsx");
  const supportDetail = await read("src/app/app/admin/support/[id]/page.tsx");
  const abuseContext = await read("src/app/app/admin/support/ContactAbuseContext.tsx");

  assert.match(migration, /public_contact_pending_verifications/);
  assert.match(migration, /create_public_contact_verification/);
  assert.match(migration, /verify_public_contact_submission/);
  assert.match(migration, /insert into public\.support_tickets/);
  assert.match(migration, /email_verified_at/);
  assert.match(migration, /email_verified/);
  assert.match(migration, /prior_verified_email_count/);
  assert.match(migration, /revoke all on function public\.submit_public_contact_ticket/);
  assert.match(migration, /grant execute on function public\.create_public_contact_verification[\s\S]*service_role/);
  assert.doesNotMatch(migration, /grant execute on function public\.create_public_contact_verification[\s\S]*to anon/);
  assert.match(contactAction, /redirect\("\/contact\?verify=1"\)/);
  assert.match(verifyRoute, /verify_public_contact_submission/);
  assert.match(verifyRoute, /NEXT_PUBLIC_SITE_URL/);
  assert.match(verifyRoute, /contactDestination\(request, "\/contact\?verified=1"\)/);
  assert.match(verifyRoute, /\/contact\?verified=1/);
  assert.match(contactPage, /contact\.verifyTitle/);
  assert.match(supportDetail, /ContactAbuseContext/);
  assert.match(abuseContext, /Abuse context/);
  assert.match(abuseContext, /Submission IP/);
  assert.match(abuseContext, /Email verified/);
});


test("live contact verification stays out of the inbox until verified and is idempotent", { skip: !LOCAL_DB_CONTAINER }, () => {
  const tokenHash = "a".repeat(64);
  const sql = String.raw`
begin;
do $$
declare
  pending_id uuid;
  ticket_one uuid;
  ticket_two uuid;
  before_count bigint;
  staged_count bigint;
  after_count bigint;
begin
  select count(*) into before_count from public.support_tickets where ticket_type = 'public_contact';
  pending_id := public.create_public_contact_verification(
    'Verification Fixture',
    'verification-fixture@example.test',
    'other',
    'Verification fixture subject',
    'This message must not enter the staff inbox before email verification.',
    '${tokenHash}',
    jsonb_build_object(
      'ip','203.0.113.10',
      'ip_hash','fixture-ip-hash',
      'client_key_hash','fixture-client-hash',
      'user_agent','fixture-agent',
      'request_metadata_version',3,
      'client_reported',jsonb_build_object('source','browser_form','schema_version',1,'timezone','Europe/Madrid','utc_offset_minutes',120,'timestamp_utc','2026-09-11T13:24:52.000Z','epoch_ms',1789133092000,'language','es-ES','languages',jsonb_build_array('es-ES','es'))
    )
  );
  select count(*) into staged_count from public.support_tickets where ticket_type = 'public_contact';
  if staged_count <> before_count then raise exception 'pending contact leaked into staff inbox'; end if;

  ticket_one := public.verify_public_contact_submission(
    pending_id,
    '${tokenHash}',
    jsonb_build_object('ip','203.0.113.10','client_key_hash','fixture-client-hash','user_agent','fixture-agent')
  );
  ticket_two := public.verify_public_contact_submission(
    pending_id,
    '${tokenHash}',
    jsonb_build_object('ip','203.0.113.10','client_key_hash','fixture-client-hash','user_agent','fixture-agent')
  );
  if ticket_one is null or ticket_two <> ticket_one then raise exception 'verification is not idempotent'; end if;

  select count(*) into after_count from public.support_tickets where ticket_type = 'public_contact';
  if after_count <> before_count + 1 then raise exception 'verification did not create exactly one contact ticket'; end if;
  if not exists (
    select 1 from public.support_tickets
     where id = ticket_one
       and contact_request_metadata->>'email_verified' = 'true'
       and contact_request_metadata->>'client_key_hash' = 'fixture-client-hash'
       and contact_request_metadata->'client_reported'->>'timezone' = 'Europe/Madrid'
       and contact_request_metadata->'client_reported'->>'language' = 'es-ES'
       and contact_request_metadata->>'request_metadata_version' = '3'
  ) then raise exception 'verified ticket metadata is incomplete'; end if;
end $$;
rollback;`;
  execFileSync("docker", ["exec", "-i", LOCAL_DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: sql, stdio: ["pipe", "pipe", "pipe"] });
});
