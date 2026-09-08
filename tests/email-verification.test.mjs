import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../supabase/migrations/20260902220000_require_verified_email.sql", import.meta.url), "utf8");
const readBoundary = await readFile(new URL("../supabase/migrations/20260902220100_require_verified_email_reads.sql", import.meta.url), "utf8");
const config = await readFile(new URL("../supabase/config.toml", import.meta.url), "utf8");
const actions = await readFile(new URL("../src/app/auth/actions.ts", import.meta.url), "utf8");
const confirmRoute = await readFile(new URL("../src/app/auth/confirm/page.tsx", import.meta.url), "utf8");
const appLayout = await readFile(new URL("../src/app/app/layout.tsx", import.meta.url), "utf8");
const checkEmail = await readFile(new URL("../src/app/check-email/page.tsx", import.meta.url), "utf8");
const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");

test("Supabase email confirmation is enabled", () => {
  assert.match(config, /\[auth\.email\][\s\S]*enable_confirmations = true/);
  assert.match(actions, /emailRedirectTo: await confirmationRedirect\(\)/);
  assert.match(actions, /redirect\("\/check-email"\)/);
  assert.match(actions, /email_not_confirmed/);
});

test("unconfirmed sessions are stopped at the server-rendered app boundary", () => {
  assert.match(appLayout, /auth\.getUser\(\)/);
  assert.match(appLayout, /email_confirmed_at/);
  assert.match(appLayout, /redirect\("\/check-email"\)/);
  assert.match(actions, /!data\.user\?\.email_confirmed_at/);
});

test("confirmation callback only continues after Supabase confirms the user", () => {
  assert.match(confirmRoute, /auth\.verifyOtp/);
  assert.match(confirmRoute, /exchangeCodeForSession/);
  assert.match(confirmRoute, /auth\.getUser\(\)/);
  assert.match(confirmRoute, /user\?\.email_confirmed_at/);
  assert.match(confirmRoute, /\/app\/profile\/setup/);
  assert.match(confirmRoute, /Confirmation link is invalid or expired/);
});

test("verification screen can resend without exposing account existence", () => {
  assert.match(actions, /auth\.resend/);
  assert.match(actions, /response generic|Keep the response generic/i);
  assert.match(actions, /We couldn't resend that email yet/);
  assert.match(checkEmail, /Check your email/);
  assert.match(checkEmail, /resendVerificationEmail/);
  assert.match(checkEmail, /Send again/);
});

test("database blocks unverified profile writes and direct normal feature bypasses", () => {
  assert.match(migration, /create or replace function public\.is_email_verified\(\)/);
  assert.match(migration, /auth\.users u[\s\S]*email_confirmed_at is not null/);
  assert.match(migration, /profiles_require_verified_email/);
  assert.match(migration, /Email verification required/);
  assert.match(migration, /Participants send active verified adult unblocked messages/);
  assert.match(migration, /Users upload own avatar[\s\S]*public\.is_email_verified\(\)/);
  assert.match(migration, /create or replace function public\.submit_introduction[\s\S]*if not public\.is_email_verified\(\)/);
  assert.match(migration, /create or replace function public\.reply_to_introduction[\s\S]*if not public\.is_email_verified\(\)/);
  assert.match(migration, /create or replace function public\.request_photo_access[\s\S]*if not public\.is_email_verified\(\)/);
});

test("unverified sessions cannot read or mutate normal relationship data", () => {
  for (const policy of ["Participants read conversations", "Participants read participants", "Participants read messages", "Participants read introductions", "Users read own notifications", "Photo request participants can read"]) {
    assert.match(readBoundary, new RegExp(`create policy "${policy}"[\\s\\S]*public\\.is_email_verified\\(\\)`));
  }
  assert.match(readBoundary, /create or replace function public\.is_admin[\s\S]*public\.is_email_verified\(\)/);
  assert.match(readBoundary, /create or replace function public\.unread_notification_count[\s\S]*public\.is_email_verified\(\)/);
});

test("verification helper and protected functions are not anonymously executable", () => {
  assert.match(migration, /revoke all on function public\.is_email_verified\(\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.is_email_verified\(\) to authenticated/);
  assert.match(migration, /revoke all on function public\.submit_introduction\(uuid, text\) from public, anon/);
  assert.match(migration, /revoke all on function public\.reply_to_introduction\(uuid, text\) from public, anon/);
});

test("production email delivery and callback requirements are documented", () => {
  assert.match(readme, /Confirm email/);
  assert.match(readme, /SMTP/);
  assert.match(readme, /NEXT_PUBLIC_SITE_URL/);
  assert.match(readme, /\/auth\/confirm/);
  assert.match(readme, /public email-verified badge/i);
});
