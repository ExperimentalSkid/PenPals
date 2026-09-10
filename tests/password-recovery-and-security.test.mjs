import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const [actions, signIn, signUp, confirm, recovery, update, updateForm, settings, config, nextConfig, migration] = await Promise.all([
  read("src/app/auth/actions.ts"),
  read("src/app/sign-in/page.tsx"),
  read("src/app/sign-up/page.tsx"),
  read("src/app/auth/confirm/ConfirmEmailClient.tsx"),
  read("src/app/forgot-password/page.tsx"),
  read("src/app/update-password/page.tsx"),
  read("src/app/update-password/UpdatePasswordForm.tsx"),
  read("src/app/app/settings/page.tsx"),
  read("supabase/config.toml"),
  read("next.config.ts"),
  read("supabase/migrations/20260904240000_login_identifier_rate_limits.sql"),
]);

test("password recovery has a generic request page and recovery destination", () => {
  assert.match(signIn, /href="\/forgot-password"/);
  assert.match(recovery, /requestPasswordReset/);
  assert.match(actions, /resetPasswordForEmail\(email, \{ redirectTo: await confirmationRedirect\(\) \}\)/);
  assert.match(confirm, /if \(type === "recovery"\) return "\/update-password"/);
  assert.match(update, /UpdatePasswordForm/);
  assert.match(updateForm, /@\/app\/auth\/actions/);
  assert.match(updateForm, /minLength=\{8\}/);
});

test("new password changes validate length and confirmation", () => {
  assert.match(signUp, /minLength=\{8\}/);
  assert.match(actions, /password\.length < 8/);
  assert.match(actions, /password !== confirmation/);
  assert.match(settings, /changePassword/);
  assert.match(settings, /signOutOtherSessions/);
});

test("identifier login has database and proxy-facing abuse limits", () => {
  assert.match(migration, /auth_login_rate_limits/);
  assert.match(migration, /consume_login_identifier_attempt/);
  assert.match(migration, /consume_login_client_attempt/);
  assert.match(migration, /extensions\.digest\('identifier:' \|\| normalized, 'sha256'\)/);
  assert.match(actions, /consume_login_client_attempt/);
  assert.match(actions, /x-forwarded-for/);
});

test("security hardening keeps CSP report-only and browser assets first-party", () => {
  assert.match(nextConfig, /Content-Security-Policy-Report-Only/);
  assert.match(nextConfig, /default-src 'self'/);
  assert.match(nextConfig, /object-src 'none'/);
  assert.match(nextConfig, /frame-ancestors 'none'/);
  assert.match(nextConfig, /https:\/\/\*\.tile\.openstreetmap\.org/);
  assert.doesNotMatch(nextConfig, /i\.pravatar\.cc/);
});

test("production responses include baseline security headers", () => {
  assert.match(nextConfig, /X-Content-Type-Options/);
  assert.match(nextConfig, /X-Frame-Options/);
  assert.match(nextConfig, /Referrer-Policy/);
  assert.match(nextConfig, /Permissions-Policy/);
  assert.match(nextConfig, /Strict-Transport-Security/);
});

test("existing local auth fixtures remain compatible while policy is tightened at app entry", () => {
  assert.match(config, /minimum_password_length = 6/);
  assert.match(signUp, /auth\.signUp\.passwordHint/);
});
