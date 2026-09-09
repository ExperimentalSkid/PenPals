import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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

test("public contact UI submits pre-login messages and staff can open a dedicated inbox", async () => {
  const contactPage = await read("src/app/contact/page.tsx");
  const contactAction = await read("src/app/contact/actions.ts");
  const contactInbox = await read("src/app/app/admin/contact/page.tsx");
  const supportDetail = await read("src/app/app/admin/support/[id]/page.tsx");
  const supportActions = await read("src/app/app/admin/support/actions.ts");
  const navigation = await read("src/app/app/AppNavigation.tsx");
  const layout = await read("src/app/app/layout.tsx");

  assert.match(contactPage, /submitPublicContact/);
  for (const field of ["name", "email", "topic", "subject", "message"]) assert.match(contactPage, new RegExp(`name=\\"${field}\\"`));
  assert.doesNotMatch(contactPage, /attachments/);
  assert.match(contactAction, /submit_public_contact_ticket/);
  assert.match(contactAction, /clientKeyFromHeaders/);
  assert.match(contactInbox, /staff_list_public_contact_tickets/);
  assert.match(contactInbox, /Contact Inbox/);
  assert.match(contactInbox, /return_to=\$\{encodeURIComponent\(`\/app\/admin\/contact/);
  assert.match(supportDetail, /Reply by email/);
  assert.match(supportDetail, /Send email reply/);
  assert.match(supportDetail, /Contact Inbox/);
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
  assert.match(emailSource, /escapeHtml/);
  assert.doesNotMatch(emailSource, /re_[A-Za-z0-9_]{20,}/);
  assert.match(appConfig, /RESEND_API_KEY/);
  assert.match(appConfig, /SUPPORT_EMAIL_FROM/);
  assert.match(envExample, /SUPPORT_EMAIL_FROM="Pen-Pals <no-reply@pen-pals\.net>"/);
  assert.match(envExample, /SUPPORT_EMAIL_REPLY_TO=/);
});
