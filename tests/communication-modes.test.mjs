import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20260903120000_communication_mode_preferences.sql", root), "utf8");
const lifecycleMigration = await readFile(new URL("supabase/migrations/20260903121000_communication_mode_lifecycle_guard.sql", root), "utf8");
const settings = await readFile(new URL("src/app/app/settings/page.tsx", root), "utf8");
const actions = await readFile(new URL("src/app/app/profile/actions.ts", root), "utf8");
const profilePage = await readFile(new URL("src/app/app/profile/[username]/page.tsx", root), "utf8");
const profileView = await readFile(new URL("src/app/app/profile/[username]/ProfileView.tsx", root), "utf8");
const conversation = await readFile(new URL("src/app/app/messages/[id]/page.tsx", root), "utf8");
const snailMailPanel = await readFile(new URL("src/app/app/messages/[id]/SnailMailPanel.tsx", root), "utf8");

test("communication modes default to both and require at least one", () => {
  assert.match(migration, /add column if not exists allow_instant_messages boolean not null default true/i);
  assert.match(migration, /add column if not exists allow_snail_mail boolean not null default true/i);
  assert.match(migration, /check \(allow_instant_messages or allow_snail_mail\)/i);
  assert.match(migration, /At least one communication mode must remain enabled/);
});

test("communication preference saves are authenticated and server-authoritative", () => {
  assert.match(migration, /create or replace function public\.save_communication_preferences\([\s\S]*?p_allow_instant_messages boolean,[\s\S]*?p_allow_snail_mail boolean[\s\S]*?\)/i);
  assert.match(migration, /not public\.is_email_verified\(\)/);
  assert.match(migration, /grant execute on function public\.save_communication_preferences\(boolean, boolean\)\s+to authenticated/i);
  assert.match(migration, /revoke all on function public\.save_communication_preferences\(boolean, boolean\)\s+from public, anon, authenticated/i);
  assert.match(actions, /rpc\("save_communication_preferences"/);
  assert.match(settings, /name="allow_instant_messages"/);
  assert.match(settings, /name="allow_snail_mail"/);
});

test("only a privacy-aware public mode is exposed on profiles", () => {
  assert.match(migration, /create or replace function public\.get_public_communication_mode\(target_user uuid\)/i);
  assert.match(migration, /public\.viewer_can_access_profile\(p\.id\)/);
  assert.match(migration, /when p\.allow_instant_messages and p\.allow_snail_mail then 'both'/i);
  assert.match(migration, /grant execute on function public\.get_public_communication_mode\(uuid\)\s+to authenticated/i);
  assert.match(profilePage, /get_public_communication_mode/);
  assert.match(profileView, /app\.profile\.prefersSnailMail/);
  assert.match(profileView, /app\.profile\.prefersInstant/);
  assert.match(profileView, /app\.profile\.openToBoth/);
});

test("new contact paths enforce recipient modes without changing existing records", () => {
  assert.match(migration, /create or replace function public\.enforce_instant_communication_mode\(\)/i);
  assert.match(migration, /direct_pair_communication_mode_guard/);
  assert.match(migration, /not p\.allow_instant_messages/);
  assert.match(lifecycleMigration, /p\.deactivated_at is not null or p\.inactive_mode/);
  assert.match(migration, /create or replace function public\.enforce_snail_mail_communication_mode\(\)/i);
  assert.match(migration, /snail_mail_communication_mode_guard/);
  assert.match(migration, /not p\.allow_snail_mail/);
  assert.match(conversation, /canComposeSnailMail/);
  assert.match(conversation, /get_public_communication_mode/);
  assert.match(snailMailPanel, /app\.snail\.unavailablePreferences/);
  assert.match(snailMailPanel, /canCompose/);
});
