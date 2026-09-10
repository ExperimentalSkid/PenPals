import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("Settings exposes the full user control surface", async () => {
  const page = await read("src/app/app/settings/page.tsx");
  for (const marker of [
    'name="profile_visibility"', 'id="notifications"', 'get_my_notification_preferences',
    'id="profile-language"', '/app/profile/setup', 'LanguageSwitcher', 'accountEmail',
    'changeAccountEmail', 'get_my_security_settings_summary', 'require_login_mfa',
    'recentSessions', 'signOutOtherSessions', '/app/settings/blocked', '/app/settings/data-export',
  ]) assert.match(page, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("notification preferences are private and do not suppress staff operational alerts", async () => {
  const sql = await read("supabase/migrations/20260910180500_user_notification_preferences.sql");
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on table public\.user_notification_preferences from public, anon, authenticated/);
  assert.match(sql, /get_my_notification_preferences/);
  assert.match(sql, /save_my_notification_preferences/);
  assert.match(sql, /notifications_preferences_filter/);
  assert.doesNotMatch(sql, /new\.type in \([^)]*support_ticket_created[^)]*\).*support_updates/s);
  assert.doesNotMatch(sql, /new\.type in \([^)]*support_ticket_user_reply[^)]*\).*support_updates/s);
});

test("login MFA reuses a verified Supabase TOTP factor and gates app entry", async () => {
  const sql = await read("supabase/migrations/20260910190500_user_settings_completion.sql");
  const layout = await read("src/app/app/layout.tsx");
  const challenge = await read("src/app/auth/mfa/MfaChallenge.tsx");
  assert.match(sql, /require_login_mfa/);
  assert.match(sql, /auth\.mfa_factors/);
  assert.match(sql, /factor_type::text = 'totp'/);
  assert.match(sql, /status::text = 'verified'/);
  assert.match(layout, /require_login_mfa[\s\S]*getAuthenticatorAssuranceLevel[\s\S]*\/auth\/mfa/);
  assert.match(challenge, /mfa\.listFactors/);
  assert.match(challenge, /mfa\.challenge/);
  assert.match(challenge, /mfa\.verify/);
});

test("email changes require provider confirmation and exports include new settings", async () => {
  const actions = await read("src/app/app/settings/data-actions.ts");
  const confirm = await read("src/app/auth/confirm/ConfirmEmailClient.tsx");
  const exportRoute = await read("src/app/app/settings/data-export/route.ts");
  assert.match(actions, /updateUser\(\{ email: nextEmail \}, \{ emailRedirectTo/);
  assert.match(confirm, /email_change/);
  assert.match(exportRoute, /get_my_notification_preferences/);
  assert.match(exportRoute, /get_my_security_settings_summary/);
  assert.match(exportRoute, /notification-preferences\.csv/);
  assert.match(exportRoute, /active-sessions\.csv/);
  assert.match(exportRoute, /require_login_mfa/);
});
