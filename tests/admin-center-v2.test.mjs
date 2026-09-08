import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("..", import.meta.url).pathname.replace(/^\//, "").replaceAll("/", "\\");
const migration = fs.readFileSync(`${root}supabase\\migrations\\20260902200000_admin_center_v2.sql`, "utf8");
const dashboardMigration = fs.readFileSync(`${root}supabase\\migrations\\20260902200100_admin_dashboard_counts.sql`, "utf8");
const guard = fs.readFileSync(`${root}src\\app\\app\\admin\\guard.ts`, "utf8");
const conversationPage = fs.readFileSync(`${root}src\\app\\app\\admin\\conversations\\[id]\\page.tsx`, "utf8");
const conversationReasonMigration = fs.readFileSync(`${root}supabase\\migrations\\20260902200400_conversation_review_reason_floor.sql`, "utf8");

test("report details use an explicit moderation-safe projection", () => {
  const fn = migration.slice(migration.indexOf("create or replace function public.get_report_details"), migration.indexOf("-- Staff routes"));
  assert.doesNotMatch(fn, /to_jsonb\s*\(/i);
  assert.match(fn, /jsonb_build_object\(\s*'report'/);
  assert.match(fn, /'avatar_available'/);
  assert.doesNotMatch(fn, /'role'/);
  assert.doesNotMatch(fn, /'privacy|profile_visibility|show_activity_status|last_active_at|deactivated_at'/);
});

test("staff route guard checks deactivation before granting access", () => {
  assert.match(guard, /select\("role,deactivated_at"\)/);
  assert.match(guard, /profile\?\.deactivated_at/);
});

test("moderation cases preserve reports and independent reporter metrics", () => {
  assert.match(migration, /create table if not exists public\.moderation_cases/);
  assert.match(migration, /create table if not exists public\.moderation_case_reports/);
  assert.match(migration, /report_count bigint/);
  assert.match(migration, /independent_reporter_count bigint/);
  assert.match(migration, /count\(distinct r\.reporter_id\)/);
  assert.match(migration, /target_type in \('message','introduction'\)/);
});

test("case creation groups only exact message or introduction targets", () => {
  const fn = migration.slice(migration.indexOf("create or replace function public.link_report_to_moderation_case"), migration.indexOf("-- Explicit staff case listing"));
  assert.match(fn, /prior\.target_type = new\.target_type and prior\.target_id = new\.target_id/);
  assert.match(fn, /elsif new\.target_type = 'profile'/);
});

test("case linking serializes concurrent reports for the same target", () => {
  const concurrencyMigration = fs.readFileSync(`${root}supabase\\migrations\\20260902201100_case_link_concurrency.sql`, "utf8");
  assert.match(concurrencyMigration, /pg_advisory_xact_lock/);
  assert.match(concurrencyMigration, /penpal-report-case/);
});

test("case claiming is concurrency-safe and leases expire", () => {
  const fn = migration.slice(migration.indexOf("create or replace function public.claim_moderation_case"), migration.indexOf("create or replace function public.release_moderation_case"));
  assert.match(fn, /pg_advisory_xact_lock/);
  assert.match(fn, /for update/);
  assert.match(fn, /claim_expires_at/);
});

test("case mutations are staff-only and audited", () => {
  for (const name of ["claim_moderation_case", "release_moderation_case", "reassign_moderation_case", "set_moderation_case_status", "add_moderation_case_note"]) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${name}`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${name}`));
  }
  assert.match(migration, /'case_status_change'/);
  assert.match(migration, /'case_claim'/);
  assert.match(migration, /'case_reassign'/);
});

test("case status audit preserves the previous status", () => {
  const statusAuditMigration = fs.readFileSync(`${root}supabase\\migrations\\20260902201400_case_status_audit_old_status.sql`, "utf8");
  assert.match(statusAuditMigration, /select status into previous_status/);
  assert.match(statusAuditMigration, /previous_status, new_status/);
});

test("moderators cannot see admin-only audit categories", () => {
  assert.match(migration, /create policy "Staff read scoped audit log"/);
  assert.match(migration, /'status_change','case_created','case_status_change','case_claim','case_release'/);
  assert.match(migration, /public\.is_admin\(\)/);
  assert.match(migration, /security_context_view/);
});

test("reactivation preserves the pre-deactivation introduction preference", () => {
  assert.match(migration, /accepting_new_conversations_before_deactivation/);
  assert.match(migration, /coalesce\(accepting_new_conversations_before_deactivation, accepting_new_conversations\)/);
  assert.match(migration, /accepting_new_conversations_before_deactivation = null/);
});

test("admin datasets use server-side pagination", () => {
  assert.match(migration, /admin_list_moderation_cases[\s\S]*page_size integer/);
  assert.match(migration, /admin_list_users_page[\s\S]*page_size integer/);
  assert.match(migration, /admin_list_audit_entries[\s\S]*page_size integer/);
  assert.match(migration, /limit page_size offset page_offset/);
});

test("age appeal queue is bounded server-side", () => {
  const ageAppealMigration = fs.readFileSync(`${root}supabase\\migrations\\20260902201000_age_appeals_pagination.sql`, "utf8");
  const ageAppealPage = fs.readFileSync(`${root}src\\app\\app\\admin\\age-appeals\\page.tsx`, "utf8");
  assert.match(ageAppealMigration, /admin_list_age_appeals_page/);
  assert.match(ageAppealMigration, /limit page_size offset page_offset/);
  assert.match(ageAppealPage, /admin_list_age_appeals_page/);
});

test("dashboard exposes actionable case and technical-job aggregates", () => {
  assert.match(dashboardMigration, /admin_dashboard_summary/);
  assert.match(dashboardMigration, /high_priority_unassigned/);
  assert.match(dashboardMigration, /storage_failed/);
  assert.match(dashboardMigration, /retention_unconfigured/);
  assert.match(dashboardMigration, /active_holds/);
});

test("privileged conversation review requires a meaningful operator reason", () => {
  assert.match(conversationPage, /accessReason\.length < 10/);
  assert.match(conversationPage, /Reason required/);
  assert.match(conversationPage, /minLength=\{10\}/);
  assert.match(conversationPage, /access_reason: accessReason/);
  assert.match(conversationReasonMigration, /char_length\(clean_reason\) < 10/);
});

test("profile restoration requires exact retained evidence and reason", () => {
  assert.match(migration, /admin_restore_profile_content/);
  assert.match(migration, /Evidence is unavailable for restoration/);
  assert.match(migration, /Current profile content is not empty/);
  assert.match(migration, /'profile_content_restored'/);
  assert.match(migration, /restore_reason/);
});

test("case and audit routes are deep-linkable and exposed to staff navigation", () => {
  assert.match(fs.readFileSync(`${root}src\\app\\app\\admin\\cases\\page.tsx`, "utf8"), /\/app\/admin\/cases\/\$\{item\.id\}/);
  assert.match(fs.readFileSync(`${root}src\\app\\app\\admin\\cases\\[id]\\page.tsx`, "utf8"), /admin_get_moderation_case/);
  assert.match(fs.readFileSync(`${root}src\\app\\app\\layout.tsx`, "utf8"), /href="\/app\/admin\/cases"/);
});
