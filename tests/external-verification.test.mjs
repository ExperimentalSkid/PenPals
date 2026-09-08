import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../supabase/migrations/20260902230000_external_verification_foundation.sql", import.meta.url), "utf8");
const exportRoute = await readFile(new URL("../src/app/app/settings/data-export/route.ts", import.meta.url), "utf8");
const inventory = await readFile(new URL("../docs/data-inventory.md", import.meta.url), "utf8");

test("external verification identities are private and uniquely linked while active", () => {
  assert.match(migration, /create table if not exists public\.external_account_verifications/);
  assert.match(migration, /penpal_user_id uuid not null references auth\.users\(id\) on delete cascade/);
  assert.match(migration, /provider_subject_fingerprint text not null/);
  assert.match(migration, /status text not null default 'not_verified'/);
  assert.match(migration, /status in \('not_verified', 'linked_not_eligible', 'verified'\)/);
  assert.match(migration, /external_account_verifications_active_subject_idx[\s\S]*where revoked_at is null/);
  assert.match(migration, /external_account_verifications_active_user_provider_idx[\s\S]*where revoked_at is null/);
  assert.match(migration, /alter table public\.external_account_verifications enable row level security/);
  assert.match(migration, /revoke all on table public\.external_account_verifications from public, anon, authenticated/);
});

test("provider policy capability and duration values are configurable but unset by default", () => {
  assert.match(migration, /create table if not exists public\.external_verification_provider_policies/);
  assert.match(migration, /enabled boolean not null default false/);
  assert.match(migration, /supported_capabilities text\[\] not null default '\{\}'::text\[\]/);
  assert.match(migration, /required_capabilities text\[\] not null default '\{\}'::text\[\]/);
  assert.match(migration, /minimum_external_account_age interval/);
  assert.match(migration, /reverification_period interval/);
  assert.match(migration, /no seeded values|no providers, durations, or requirements are seeded/i);
  assert.match(migration, /required_capabilities <@ supported_capabilities/);
  assert.match(migration, /minimum_external_account_age is null or 'account_age' = any\(supported_capabilities\)/);
});

test("public profile projection exposes only a verification boolean", () => {
  assert.match(migration, /create or replace function public\.is_profile_verified\(target_user uuid\)/);
  assert.match(migration, /'is_verified', public\.is_profile_verified\(profile_row\.id\)/);
  assert.doesNotMatch(migration.slice(migration.indexOf("return jsonb_build_object(") , migration.indexOf("end;", migration.indexOf("return jsonb_build_object("))), /'provider'|provider_subject_fingerprint|capabilities|verified_at|reverify_after/);
  assert.match(migration, /revoke all on function public\.is_profile_verified\(uuid\) from public, anon, authenticated/);
});

test("verification records are included in the requester's GDPR export only", () => {
  assert.match(migration, /'external_verification', coalesce\([\s\S]*from public\.external_account_verifications v[\s\S]*where v\.penpal_user_id = me/);
  assert.match(exportRoute, /external_verification: asArray\(supplementRecord\.external_verification\)/);
  assert.match(exportRoute, /external-verification\.csv/);
  assert.match(exportRoute, /provider_subject_fingerprint/);
  assert.match(inventory, /external_account_verifications/);
  assert.match(inventory, /public profiles receive only `is_verified`/i);
});

test("account deletion removes verification records through the auth foreign key", () => {
  assert.match(migration, /penpal_user_id uuid not null references auth\.users\(id\) on delete cascade/);
  assert.match(inventory, /Cascades with the Penpal account/);
  assert.doesNotMatch(migration, /create table.*retention|data_retention_policies.*external_verification/i);
});

test("provider policy management is admin-only and audited", () => {
  assert.match(migration, /create or replace function public\.admin_list_external_verification_policies\(\)/);
  assert.match(migration, /if not public\.is_admin\(\) then/);
  assert.match(migration, /create or replace function public\.set_external_verification_policy\(/);
  assert.match(migration, /A policy change reason is required/);
  assert.match(migration, /external_verification_policy_changed/);
  assert.match(migration, /revoke all on function public\.set_external_verification_policy\([^)]*\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.set_external_verification_policy\([^)]*\) to authenticated/);
});

test("the data model has no OAuth token or public social identity fields", () => {
  const tableBody = migration.slice(migration.indexOf("create table if not exists public.external_account_verifications"), migration.indexOf("alter table public.external_account_verifications enable row level security"));
  assert.doesNotMatch(tableBody, /access_token|refresh_token|oauth_token|username|profile_url|followers|posts/i);
  assert.match(tableBody, /provider_subject_fingerprint/);
  assert.match(tableBody, /provider_account_created_at/);
});
