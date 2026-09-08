import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../supabase/migrations/20260902212000_enable_service_background_purge.sql", import.meta.url), "utf8");
const auditGuardMigration = await readFile(new URL("../supabase/migrations/20260902212100_allow_service_purge_audit_guard.sql", import.meta.url), "utf8");
const worker = await readFile(new URL("../scripts/run-background-jobs.mjs", import.meta.url), "utf8");
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("retention purge accepts only service jobs or active administrators", () => {
  assert.match(migration, /auth\.role\(\).*service_role/);
  assert.match(migration, /current_user.*service_role/);
  assert.match(migration, /not public\.is_admin\(\)/);
  assert.match(migration, /revoke all on function public\.purge_retained_data\(\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.purge_retained_data\(\) to service_role/);
});

test("service retention jobs can pass the protected audit guard", () => {
  assert.match(auditGuardMigration, /auth\.role\(\) in \('authenticated', 'service_role'\)/);
  assert.match(auditGuardMigration, /app\.allow_moderation_audit_mutation/);
  assert.match(auditGuardMigration, /revoke all on function public\.prevent_moderation_audit_mutation\(\) from public, anon, authenticated/);
});

test("background worker uses protected claim/complete/fail paths and never logs credentials", () => {
  assert.match(worker, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(worker, /claim_avatar_deletion_batch/);
  assert.match(worker, /complete_avatar_deletion_batch/);
  assert.match(worker, /fail_avatar_deletion_batch/);
  assert.match(worker, /expire_introductions/);
  assert.match(worker, /refresh_seo_community_aggregates/);
  assert.match(worker, /evaluate_seo_community_eligibility/);
  assert.match(worker, /capture_seo_community_aggregate_snapshots/);
  assert.match(worker, /refresh_seo_community_aggregates[\s\S]*evaluate_seo_community_eligibility[\s\S]*capture_seo_community_aggregate_snapshots/);
  assert.match(worker, /purge_retained_data/);
  assert.doesNotMatch(worker, /console\.(log|error|warn).*serviceRoleKey/);
  assert.doesNotMatch(worker, /process\.stdout\.write\(.*serviceRoleKey/);
});

test("worker is an explicit one-shot package command", () => {
  assert.equal(packageJson.scripts["jobs:run"], "node scripts/run-background-jobs.mjs");
});
