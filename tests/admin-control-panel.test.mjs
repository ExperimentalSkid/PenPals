import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../supabase/migrations/20260902110000_add_admin_control_panel.sql", import.meta.url), "utf8");
const userDetail = await readFile(new URL("../src/app/app/admin/users/[id]/page.tsx", import.meta.url), "utf8");

test("admin directory RPC is locked down and supports operational filters", () => {
  assert.match(sql, /create or replace function public\.admin_list_users/);
  assert.match(sql, /security definer/);
  assert.match(sql, /set search_path = public/);
  assert.match(sql, /public\.is_admin\(\)/);
  assert.match(sql, /status_filter/);
  assert.match(sql, /role_filter/);
  assert.match(sql, /completeness_filter/);
  assert.match(sql, /revoke all on function public\.admin_list_users/);
  assert.match(sql, /grant execute on function public\.admin_list_users[\s\S]*to authenticated/);
});

test("admin user detail preserves only narrowly scoped moderation context", () => {
  assert.match(sql, /admin_get_user_detail/);
  assert.match(sql, /'languages'/);
  assert.match(sql, /'interests'/);
  assert.match(sql, /'reports'/);
  assert.match(sql, /'audit'/);
  assert.match(sql, /if not public\.is_admin\(\)/);
  assert.match(sql, /revoke all on function public\.admin_get_user_detail/);
});

test("administrative role and account actions are self-protected and audited", () => {
  assert.match(sql, /create or replace function public\.set_user_role/);
  assert.match(sql, /target_user = auth\.uid\(\)/);
  assert.match(sql, /create or replace function public\.admin_set_account_status/);
  assert.match(sql, /Administrators cannot change their own account status/);
  assert.match(sql, /action, old_status, new_status, metadata/);
  assert.match(sql, /role_change/);
  assert.match(sql, /deactivate_account/);
  assert.match(sql, /reactivate_account/);
  assert.match(sql, /target_user_id/);
});

test("admin user detail hides self role and account status controls", () => {
  assert.match(userDetail, /uid === profile\.id/);
  assert.match(userDetail, /You cannot change your own role or account status/);
});

test("admin controls preserve a last active administrator", async () => {
  const hardened = await readFile(new URL("../supabase/migrations/20260902111000_harden_admin_last_admin.sql", import.meta.url), "utf8");
  assert.match(hardened, /Cannot remove the last active administrator/);
  assert.match(hardened, /Cannot deactivate the last active administrator/);
  assert.match(hardened, /pg_advisory_xact_lock/);
  assert.match(hardened, /set search_path = public/);
});

test("audit report linkage is optional for non-report administrative actions", () => {
  assert.match(sql, /alter column report_id drop not null/);
  assert.match(sql, /add column if not exists target_user_id uuid references public\.profiles/);
  assert.match(sql, /metadata jsonb not null default/);
});

test("privileged conversation review is scoped and audited", async () => {
  const review = await readFile(new URL("../supabase/migrations/20260902112000_add_privileged_conversation_review.sql", import.meta.url), "utf8");
  assert.match(review, /admin_list_user_conversations/);
  assert.match(review, /admin_get_conversation_review/);
  assert.match(review, /if not public\.is_admin\(\)/);
  assert.match(review, /if not staff_access/);
  assert.match(review, /report context is required/);
  assert.match(review, /Conversation is not tied to this report/);
  assert.match(review, /conversation_review/);
  assert.match(review, /moderation_audit_log/);
  assert.match(review, /before update or delete/);
  assert.match(review, /revoke all on function public\.admin_get_conversation_review/);
});
