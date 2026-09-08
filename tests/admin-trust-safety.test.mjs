import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../supabase/migrations/20260902113000_add_admin_trust_safety.sql", import.meta.url), "utf8");
const actions = await readFile(new URL("../src/app/app/admin/actions.ts", import.meta.url), "utf8");
const detail = await readFile(new URL("../src/app/app/admin/users/[id]/page.tsx", import.meta.url), "utf8");

test("profile moderation evidence is private and preserves removed content", async () => {
  assert.match(migration, /create table if not exists public\.profile_moderation_evidence/);
  assert.match(migration, /content_type text not null check \(content_type in \('bio', 'quote', 'looking_for', 'avatar'\)\)/);
  assert.match(migration, /previous_value text/);
  assert.match(migration, /reason text not null check \(char_length\(btrim\(reason\)\) between 1 and 500\)/);
  assert.match(migration, /alter table public\.profile_moderation_evidence enable row level security/);
  assert.match(migration, /There are intentionally no ordinary-user policies/);
  assert.match(migration, /admin_remove_profile_content/);
  assert.match(migration, /if not public\.is_admin\(\)/);
  assert.match(migration, /set search_path = pg_catalog, public/);
  assert.match(migration, /profile_content_removed/);
  assert.match(migration, /update public\.profiles set avatar_path = null/);
  const hardening = await readFile(new URL("../supabase/migrations/20260902113200_harden_profile_content_validation.sql", import.meta.url), "utf8");
  assert.match(hardening, /content_type is null/);
  assert.match(hardening, /admin_remove_profile_content_legacy/);
  assert.match(hardening, /revoke all on function public\.admin_remove_profile_content_legacy[\s\S]*from authenticated/);
});

test("private security context is admin-only, audited, and based on Auth audit IPs", () => {
  assert.match(migration, /admin_get_user_security_context/);
  assert.match(migration, /set search_path = pg_catalog, public, auth/);
  assert.match(migration, /from auth\.audit_log_entries al/);
  assert.match(migration, /registration_ip/);
  assert.match(migration, /last_ip/);
  assert.match(migration, /other_accounts/);
  assert.match(migration, /security_context_view/);
  assert.match(migration, /revoke all on function public\.admin_get_user_security_context/);
  assert.match(migration, /grant execute on function public\.admin_get_user_security_context\(uuid\) to authenticated/);
});

test("sensitive admin reads and content removals are audited", () => {
  assert.match(migration, /admin_log_user_detail_access/);
  assert.match(migration, /user_detail_view/);
  assert.match(migration, /admin_get_profile_content_history/);
  assert.match(migration, /profile_content_history_view/);
  assert.match(detail, /admin_log_user_detail_access/);
  assert.match(detail, /admin_get_user_security_context/);
  assert.match(detail, /admin_get_profile_content_history/);
});

test("server action passes only validated content-removal requests to the protected RPC", () => {
  assert.match(actions, /removeAdminProfileContent/);
  assert.match(actions, /requireAdmin\(\)/);
  assert.match(actions, /reason\.length < 1 \|\| reason\.length > 500/);
  assert.match(actions, /admin_remove_profile_content/);
  assert.match(actions, /removal_reason: reason/);
  assert.match(actions, /change_reason: reason/);
});

test("account controls require a reason and keep legacy RPCs private", async () => {
  const hardening = await readFile(new URL("../supabase/migrations/20260902114000_require_admin_action_reasons.sql", import.meta.url), "utf8");
  assert.match(hardening, /set_user_role\(\s*target_user uuid,\s*new_role text,\s*change_reason text/s);
  assert.match(hardening, /admin_set_account_status\(\s*target_user uuid,\s*should_deactivate boolean,\s*change_reason text/s);
  assert.match(hardening, /char_length\(clean_reason\) > 500/);
  assert.match(hardening, /reason', clean_reason/);
  assert.match(hardening, /set_user_role_legacy/);
  assert.match(hardening, /admin_set_account_status_legacy/);
  assert.match(hardening, /revoke all on function public\.set_user_role_legacy[\s\S]*from authenticated/);
  assert.match(hardening, /revoke all on function public\.admin_set_account_status_legacy[\s\S]*from authenticated/);
  assert.match(hardening, /Cannot remove the last active administrator/);
});
