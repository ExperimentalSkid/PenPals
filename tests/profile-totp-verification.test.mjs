import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../supabase/migrations/20260904250000_profile_totp_verification.sql", import.meta.url), "utf8");
const pauseFix = await readFile(new URL("../supabase/migrations/20260904251300_profile_totp_pause_expiry_fix.sql", import.meta.url), "utf8");
const settings = await readFile(new URL("../src/app/app/settings/page.tsx", import.meta.url), "utf8");
const panel = await readFile(new URL("../src/app/app/settings/TotpVerificationPanel.tsx", import.meta.url), "utf8");
const layout = await readFile(new URL("../src/app/app/layout.tsx", import.meta.url), "utf8");
const notifications = await readFile(new URL("../src/app/app/notifications/page.tsx", import.meta.url), "utf8");

test("profile TOTP timing is server-controlled and private", () => {
  assert.match(migration, /create table if not exists public\.profile_totp_verifications/);
  assert.match(migration, /revoke all on table public\.profile_totp_verifications from public, anon, authenticated/);
  assert.match(migration, /now\(\) \+ interval '30 days'/);
  assert.match(migration, /now\(\) \+ interval '37 days'/);
  assert.match(migration, /auth\.jwt\(\) ->> 'aal'/);
  assert.match(migration, /method ->> 'method' = 'totp'/);
  assert.match(migration, /Use the enrolled profile verification factor/);
  assert.match(migration, /profile_totp_inactive_lifecycle/);
  assert.match(migration, /profile_verification_reverify/);
});

test("the Settings verification section owns the authenticator badge flow", () => {
  assert.match(settings, /id="verification"/);
  assert.match(settings, /TotpVerificationPanel status=\{totpStatus\}/);
  assert.match(settings, /maybe_notify_profile_totp_reverification/);
  assert.match(settings, /get_my_profile_totp_status/);
  assert.match(settings, /app\.settings\.externalAccount/);
});

test("the browser completes Supabase TOTP enrollment/challenge/verification before the badge RPC", () => {
  assert.match(panel, /mfa\.listFactors/);
  assert.match(panel, /mfa\.enroll/);
  assert.match(panel, /mfa\.challenge/);
  assert.match(panel, /mfa\.verify/);
  assert.match(panel, /complete_profile_totp_verification/);
  assert.match(panel, /data:image\/svg\+xml/);
  assert.match(panel, /autoComplete="one-time-code"/);
  assert.match(panel, /pattern="\[0-9\]\{6\}"/);
});

test("grace notifications are retried from the app shell and route to verification", () => {
  assert.match(layout, /maybe_notify_profile_totp_reverification/);
  assert.match(notifications, /profile_verification_reverify/);
  assert.match(notifications, /app\/settings#verification/);
});

test("pause timing cannot revive an already expired badge", () => {
  assert.match(pauseFix, /reverify_after > paused_at then/);
  assert.match(pauseFix, /grace_until > paused_at then/);
  assert.match(pauseFix, /inactive_started_at is not null/);
  assert.match(pauseFix, /effective_at/);
  assert.match(pauseFix, /badge_visible.*effective_at < row_data\.grace_until/);
});
