import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../supabase/migrations/20260902140000_add_data_rights.sql", import.meta.url), "utf8");
const exportHardeningMigration = await readFile(new URL("../supabase/migrations/20260902160000_harden_gdpr_export.sql", import.meta.url), "utf8");
const reportScopeMigration = await readFile(new URL("../supabase/migrations/20260902161000_scope_gdpr_reports.sql", import.meta.url), "utf8");
const cooldownMigration = await readFile(new URL("../supabase/migrations/20260902143000_harden_data_export_cooldown.sql", import.meta.url), "utf8");
const erasureMigration = await readFile(new URL("../supabase/migrations/20260902144500_allow_account_erasure_after_moderation.sql", import.meta.url), "utf8");
const accountDeletionMigration = await readFile(new URL("../supabase/migrations/20260902170000_account_deletion_retention.sql", import.meta.url), "utf8");
const route = await readFile(new URL("../src/app/app/settings/data-export/route.ts", import.meta.url), "utf8");
const actions = await readFile(new URL("../src/app/app/settings/data-actions.ts", import.meta.url), "utf8");
const settings = await readFile(new URL("../src/app/app/settings/page.tsx", import.meta.url), "utf8");
const accountActions = await readFile(new URL("../src/app/app/settings/AccountActions.tsx", import.meta.url), "utf8");
const inventory = await readFile(new URL("../docs/data-inventory.md", import.meta.url), "utf8");

test("data export is authenticated, throttled, and audited", () => {
  assert.match(migration, /create or replace function public\.create_data_export\(\)/);
  assert.match(migration, /requested_at > now\(\) - interval '48 hours'/);
  assert.match(migration, /export_requested/);
  assert.match(migration, /record_data_export_download/);
  assert.match(migration, /grant execute on function public\.create_data_export\(\) to authenticated/);
  assert.match(migration, /grant execute on function public\.record_data_export_download\(uuid\) to authenticated/);
});

test("export allowlist omits secrets and moderator-only data", () => {
  assert.match(migration, /last_sign_in_at/);
  assert.match(migration, /activity_security/);
  assert.match(migration, /reports_submitted/);
  assert.doesNotMatch(migration, /encrypted_password/);
  assert.doesNotMatch(migration, /moderation_audit_log/);
  assert.doesNotMatch(migration, /profile_moderation_evidence/);
});

test("export archive contains JSON, CSV, and a category README", () => {
  assert.match(route, /README\.txt/);
  assert.match(route, /export\.json/);
  assert.match(route, /languages\.csv/);
  assert.match(route, /messages\.csv/);
  assert.match(route, /reports-about\.csv/);
  assert.match(route, /moderation-evidence\.csv/);
  assert.match(route, /application\/zip/);
  assert.match(route, /cache-control.*no-store/);
});

test("Article 15 information is included in both text and JSON", () => {
  assert.match(route, /gdpr-access-information\.txt/);
  assert.match(route, /gdpr-access-information\.json/);
  for (const field of ["purposes_of_processing", "categories_of_personal_data", "recipients_or_categories_of_recipients", "retention_periods_or_criteria", "data_subject_rights", "right_to_complain_to_supervisory_authority", "data_sources_not_obtained_directly_from_user", "automated_decision_making_and_profiling", "international_transfer_safeguards"]) {
    assert.match(route, new RegExp(field));
  }
});

test("empty CSV exports keep stable headers and uploaded photos are packaged", () => {
  assert.match(route, /function csv\(rows: unknown\[\], columns: string\[\]\)/);
  assert.match(route, /return \[columns\.join\(\",\"\)/);
  assert.match(route, /storage\.from\("avatars"\)\.download/);
  assert.match(route, /photos\/\$\{index \+ 1\}/);
});

test("export includes role/status, privacy exclusions, and redacted data about the requester", () => {
  assert.match(exportHardeningMigration, /'role', p\.role/);
  assert.match(exportHardeningMigration, /country_exclusion_codes/);
  assert.match(exportHardeningMigration, /reports_about/);
  assert.match(exportHardeningMigration, /details_redacted/);
  assert.match(exportHardeningMigration, /redacted protected moderation evidence/);
  assert.match(route, /reports_about: asArray\(supplementRecord\.reports_about\)/);
});

test("reports about the requester exclude unrelated participants' messages", () => {
  assert.match(reportScopeMigration, /where m\.sender_id = me/);
  assert.doesNotMatch(reportScopeMigration, /conversation_participants cp/);
  assert.doesNotMatch(reportScopeMigration, /reporter_id/);
  assert.doesNotMatch(reportScopeMigration, /target_id/);
  assert.match(reportScopeMigration, /details_redacted/);
});

test("export download is server-only and never uses a service key", () => {
  assert.match(route, /createClient\(\)/);
  assert.match(route, /getClaims/);
  assert.doesNotMatch(route, /SERVICE_ROLE|service_role|SUPABASE_SERVICE_ROLE_KEY/);
});

test("export cooldown is serialized against concurrent requests", () => {
  assert.match(cooldownMigration, /pg_advisory_xact_lock\(hashtext\(new\.user_id::text\)\)/);
  assert.match(cooldownMigration, /before insert on public\.data_export_requests/);
  assert.match(cooldownMigration, /requested_at > now\(\) - interval '48 hours'/);
});

test("account deletion requires explicit confirmation and recent authentication", () => {
  assert.match(actions, /confirmation.*DELETE/);
  assert.match(actions, /auth\.getUser\(\)/);
  assert.match(actions, /last_sign_in_at/);
  assert.match(actions, /list_my_avatar_paths/);
  assert.match(actions, /storage\.from\("avatars"\)\.remove/);
  assert.match(migration, /recent_sign_in < now\(\) - interval '15 minutes'/);
  assert.match(migration, /create or replace function public\.delete_my_account\(\)/);
  assert.match(migration, /delete from auth\.users where id = me/);
});

test("deletion removes user-facing interactions and shared conversations", () => {
  assert.match(accountDeletionMigration, /delete from public\.conversation_participants where user_id = me/);
  assert.match(accountDeletionMigration, /delete from public\.conversations c/);
  assert.match(accountDeletionMigration, /delete from public\.reports/);
  assert.match(accountDeletionMigration, /delete from public\.profiles where id = me/);
  assert.match(accountDeletionMigration, /account_storage_deletion_outbox/);
  assert.match(actions, /delete_my_account/);
});

test("moderator account erasure does not fail on immutable audit evidence", () => {
  assert.match(erasureMigration, /moderation_audit_log[\s\S]*alter column moderator_id drop not null/);
  assert.match(erasureMigration, /profile_moderation_evidence[\s\S]*alter column moderator_id drop not null/);
  assert.match(erasureMigration, /moderator_id\) references public\.profiles\(id\) on delete set null/);
});

test("settings distinguish reversible deactivation from permanent deletion", () => {
  assert.match(accountActions, /Deactivate account/);
  assert.match(settings, /Permanently delete account/);
  assert.match(settings, /deletion is permanent/i);
  assert.match(settings, /Download my data/);
});

test("data inventory documents access, retention, export, and open decisions", () => {
  assert.match(inventory, /Retention decisions still required/);
  assert.match(inventory, /moderation_audit_log/);
  assert.match(inventory, /auth\.audit_log_entries/);
  assert.match(inventory, /Export exclusions/);
  assert.match(inventory, /Deactivation versus deletion/);
});
