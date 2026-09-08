import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const files = {
  migration: await read("supabase/migrations/20260902233000_external_verification_provider_records.sql"),
  oauth: await read("src/lib/verification/oauth.ts"),
  server: await read("src/lib/verification/server.ts"),
  registry: await read("src/lib/verification/registry.ts"),
  google: await read("src/lib/verification/providers/google.ts"),
  facebook: await read("src/lib/verification/providers/facebook.ts"),
  instagram: await read("src/lib/verification/providers/instagram.ts"),
  tiktok: await read("src/lib/verification/providers/tiktok.ts"),
  start: await read("src/app/auth/verification/[provider]/start/route.ts"),
  callback: await read("src/app/auth/verification/[provider]/callback/route.ts"),
  settings: await read("src/app/app/settings/page.tsx"),
  profileView: await read("src/app/app/profile/[username]/ProfileView.tsx"),
  settingsActions: await read("src/app/app/settings/data-actions.ts"),
};

test("only the four approved providers are registered and public output stays boolean-only", () => {
  for (const provider of ["facebook", "instagram", "tiktok", "google"]) assert.match(files.registry, new RegExp(`${provider}VerificationAdapter`));
  assert.doesNotMatch(files.registry, /reddit|discord|linkedin|xVerification/i);
  assert.match(files.migration, /provider_name not in \('facebook', 'instagram', 'tiktok', 'google'\)/);
  assert.match(files.migration, /'is_verified'/i);
  assert.doesNotMatch(files.migration, /access_token|refresh_token|oauth_token/i);
});

test("providers establish ownership and stable identifiers with no fabricated account age", () => {
  for (const source of [files.google, files.facebook, files.instagram, files.tiktok]) {
    assert.match(source, /ownership/);
    assert.match(source, /stable_account_identifier/);
    assert.doesNotMatch(source, /account_created_at/);
    assert.doesNotMatch(source, /fields[^\n]*(created_at|followers|following|posts|profile_url|username)/i);
    assert.match(source, /discard_after_verification/);
  }
  assert.match(files.google, /openid/);
  assert.doesNotMatch(files.google, /minimumScopes:\s*\[[^\]]*profile/);
  assert.match(files.google, /minimumScopes:\s*\["openid"\]/);
  assert.match(files.facebook, /public_profile/);
  assert.match(files.instagram, /instagram_business_basic/);
  assert.match(files.tiktok, /user\.info\.basic/);
});

test("OAuth flow validates authenticated user, state, PKCE and provider responses", () => {
  assert.match(files.start, /getClaims/);
  assert.match(files.start, /email_confirmed_at/);
  assert.match(files.start, /encodeOAuthState/);
  assert.match(files.start, /supportsPkce/);
  assert.match(files.server, /minimum_oauth_scopes/);
  assert.match(files.callback, /decodeOAuthState/);
  assert.match(files.callback, /state !== oauthState\.state/);
  assert.match(files.callback, /userId !== oauthState\.userId/);
  assert.match(files.callback, /accessTokenDisposition !== "discard_after_verification"/);
  assert.match(files.oauth, /timingSafeEqual/);
  assert.match(files.oauth, /VERIFICATION_STATE_SECRET/);
  assert.match(files.oauth, /VERIFICATION_SUBJECT_HMAC_SECRET/);
  assert.doesNotMatch(files.oauth, /local-development-verification-state-secret/);
  assert.match(files.oauth, /VERIFICATION_STATE_SECRET is too short/);
  assert.match(files.google, /nonce validation failed/);
  assert.match(files.google, /createPublicKey/);
  assert.match(files.google, /createVerify/);
  assert.doesNotMatch(files.google, /tokeninfo/i);
});

test("recording verification is service-only, policy-gated and subject-unique", () => {
  assert.match(files.migration, /auth\.role\(\) <> 'service_role'/);
  assert.match(files.migration, /required_capabilities <@ established_capabilities/);
  assert.match(files.migration, /resulting_status := 'verified'/);
  assert.match(files.migration, /External account already linked/);
  assert.match(files.migration, /revoke all on function public\.record_external_verification/);
  assert.match(files.migration, /grant execute on function public\.record_external_verification[^;]* to service_role/);
});

test("unlinking immediately revokes only the current user's provider record", () => {
  assert.match(files.migration, /create or replace function public\.revoke_my_external_verification/);
  assert.match(files.migration, /penpal_user_id = auth\.uid\(\)/);
  assert.match(files.migration, /revoked_at = now\(\), status = 'not_verified'/);
  assert.match(files.migration, /grant execute on function public\.revoke_my_external_verification\(text\) to authenticated/);
});

test("verification settings expose only owner actions and callback results return there", () => {
  assert.match(files.settings, /Verify your profile/);
  assert.match(files.settings, /Verify control of an established external account/);
  assert.match(files.settings, /Verification needs refresh/);
  assert.match(files.settings, /disconnectVerification/);
  assert.match(files.settingsActions, /revoke_my_external_verification/);
  assert.match(files.server, /\/app\/settings\?verification=/);
});

test("public profile exposes a boolean-only verified badge", () => {
  assert.match(files.profileView, /profile\.is_verified/);
  assert.match(files.profileView, /Verified within the last 30 days using an authenticator app or another approved method/);
  assert.doesNotMatch(files.profileView, /provider\s*[:=]|external account age|followers|social URL/i);
});
