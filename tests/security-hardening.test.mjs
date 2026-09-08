import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../supabase/migrations/20260901120000_security_hardening.sql", import.meta.url), "utf8");
const discoveryPrivacy = await readFile(new URL("../supabase/migrations/20260902201600_hide_discovery_activity_timestamp.sql", import.meta.url), "utf8");
const rlsHelperGrant = await readFile(new URL("../supabase/migrations/20260902201700_restore_age_check_for_rls.sql", import.meta.url), "utf8");
const profileSaveAcl = await readFile(new URL("../supabase/migrations/20260902201800_revoke_public_profile_save.sql", import.meta.url), "utf8");
const blockedMessageFix = await readFile(new URL("../supabase/migrations/20260902213000_fix_blocked_message_insert_rls.sql", import.meta.url), "utf8");

test("direct conversations have a database uniqueness guard and serialized replies", () => {
  assert.match(sql, /primary key \(user_a, user_b\)/i);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /on conflict \(user_a,user_b\) do nothing/);
});

test("introduction submission rejects deactivated participants and unavailable recipients", () => {
  assert.match(sql, /id = me and deactivated_at is not null/);
  assert.match(sql, /deactivated_at is null/);
  assert.match(sql, /recipient_scope = 'nobody'/);
});

test("message inserts require an active, unblocked participant", () => {
  assert.match(sql, /Participants send active unblocked messages/);
  assert.match(sql, /deactivated_at is not null/);
  assert.match(sql, /profile_blocks/);
});

test("message inserts cannot bypass a block created by the other participant", () => {
  assert.match(blockedMessageFix, /create or replace function public\.users_are_blocked/);
  assert.match(blockedMessageFix, /security definer/);
  assert.match(blockedMessageFix, /b\.blocker_id = first_user/);
  assert.match(blockedMessageFix, /b\.blocker_id = second_user/);
  assert.match(blockedMessageFix, /public\.users_are_blocked\(auth\.uid\(\), p\.user_id\)/);
  assert.match(blockedMessageFix, /grant execute on function public\.users_are_blocked\(uuid, uuid\) to authenticated/);
});

test("discovery is served through a privacy-aware RPC and excludes deactivated users", () => {
  assert.match(sql, /get_discover_profiles/);
  assert.match(sql, /p\.id<>auth\.uid\(\)/);
  assert.match(sql, /viewer_can_access_profile\(p\.id\)/);
  assert.match(sql, /p\.deactivated_at is null/);
});

test("legacy direct conversation RPC is removed", () => {
  assert.match(sql, /drop function if exists public\.start_conversation/);
});

test("discovery does not expose exact activity timestamps", () => {
  assert.match(discoveryPrivacy, /null::timestamptz/);
  assert.match(discoveryPrivacy, /recently_active boolean/);
  assert.match(discoveryPrivacy, /case[\s\S]*p\.show_activity_status[\s\S]*p\.last_active_at >= now\(\) - interval '24 hours'/);
  assert.match(discoveryPrivacy, /p\.show_activity_status then p\.last_active_at >= now\(\) - interval '24 hours'\s+else null/);
});

test("message RLS age predicate remains executable by authenticated participants", () => {
  assert.match(rlsHelperGrant, /grant execute on function public\.is_adult_birth_date\(date\) to authenticated/i);
});

test("profile saves are not anonymously callable", () => {
  assert.match(profileSaveAcl, /revoke all on function public\.save_profile\([\s\S]*from public, anon/i);
  assert.match(profileSaveAcl, /grant execute on function public\.save_profile\([\s\S]*to authenticated/i);
});
