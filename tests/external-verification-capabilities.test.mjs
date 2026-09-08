import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../supabase/migrations/20260902231000_external_verification_capability_architecture.sql", import.meta.url), "utf8");
const foundation = await readFile(new URL("../supabase/migrations/20260902230000_external_verification_foundation.sql", import.meta.url), "utf8");
const contract = await readFile(new URL("../src/lib/verification/providers.ts", import.meta.url), "utf8");

test("provider capabilities are extensible and include only established signals", () => {
  for (const capability of [
    "ownership",
    "stable_account_identifier",
    "account_created_at",
    "token_revocation",
    "reverification",
  ]) {
    assert.match(contract, new RegExp(capability));
  }
  assert.match(migration, /drop constraint if exists external_verification_provider_pol_supported_capabilities_check/);
  assert.match(migration, /drop constraint if exists external_account_verifications_capabilities_check/);
  assert.match(migration, /required capabilities must be supported by this provider/i);
  assert.match(migration, /future minimal capabilities may be added/i);
  assert.match(contract, /capabilities: readonly ExternalVerificationCapability\[\]/);
  assert.match(contract, /provider:\$\{string\}/);
});

test("provider policy records minimum scopes and safe token disposition without storing tokens", () => {
  assert.match(migration, /minimum_oauth_scopes text\[\] not null default '\{\}'::text\[\]/);
  assert.match(migration, /access_token_retention text not null default 'discard_after_verification'/);
  assert.match(migration, /discard_after_verification/);
  assert.match(migration, /retain_for_reverification/);
  assert.match(contract, /minimumScopes: readonly string\[\]/);
  assert.match(contract, /accessTokenDisposition: AccessTokenDisposition/);
  const persistentIdentity = foundation.slice(
    foundation.indexOf("create table if not exists public.external_account_verifications"),
    foundation.indexOf("alter table public.external_account_verifications enable row level security"),
  );
  assert.doesNotMatch(persistentIdentity, /access_token|refresh_token|oauth_token/i);
});

test("future providers can omit unsupported account age and revocation signals", () => {
  assert.match(contract, /Omitted when the provider cannot prove account creation time/);
  assert.match(contract, /revokeGrant\?/);
  assert.match(contract, /reverify\?/);
  assert.match(contract, /Only capabilities established by the provider response/);
  assert.match(migration, /provider_account_created_at is null/);
  assert.match(migration, /account_created_at/);
});

test("full provider contract management is admin-only and public output stays boolean-only", () => {
  assert.match(migration, /create or replace function public\.set_external_verification_provider_contract\(/);
  assert.match(migration, /create or replace function public\.admin_list_external_verification_provider_contracts\(\)/);
  assert.match(migration, /if not public\.is_admin\(\) then/);
  assert.match(migration, /revoke all on function public\.set_external_verification_provider_contract/);
  assert.match(migration, /grant execute on function public\.set_external_verification_provider_contract[^;]* to authenticated/);
  assert.match(migration, /external_verification_provider_contract_changed/);
  assert.match(contract, /public[\s\S]*profile contract remains a single `is_verified` boolean/);
  assert.match(contract, /interface ExternalVerificationPublicState[\s\S]*is_verified: boolean/);
});

test("the shared contract remains provider-neutral", () => {
  assert.doesNotMatch(contract, /instagram|facebook|tiktok|reddit|github|google|oauth client id/i);
  assert.match(contract, /provider-neutral/);
});
