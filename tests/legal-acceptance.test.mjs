import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const [terms, signup, auth, google, callback, migration, proxy, sitemap, footer] = await Promise.all([
  read("src/app/terms/page.tsx"),
  read("src/app/sign-up/page.tsx"),
  read("src/app/auth/actions.ts"),
  read("src/app/auth/GoogleAuthButton.tsx"),
  read("src/app/auth/callback/route.ts"),
  read("supabase/migrations/20260910203000_legal_acceptance.sql"),
  read("src/proxy.ts"),
  read("src/app/sitemap.ts"),
  read("src/app/components/PublicFooter.tsx"),
]);

test("Terms are public, localized, and discoverable", () => {
  assert.match(terms, /localizedPublicMetadata\(locale, "\/terms"/);
  assert.match(terms, /terms\.sections\.\$\{key\}Title/);
  assert.match(proxy, /"\/terms"/);
  assert.match(sitemap, /"\/terms"/);
  assert.match(footer, /localizedPublicPath\("\/terms", locale\)/);
});
test("email signup requires and versions legal acceptance", () => {
  assert.match(signup, /name="legal_acceptance"[^>]*required/);
  assert.match(auth, /formData\.get\("legal_acceptance"\) === "accepted"/);
  assert.match(auth, /terms_version: TERMS_VERSION/);
  assert.match(auth, /privacy_version: PRIVACY_VERSION/);
  assert.ok(auth.indexOf("legalAccepted") < auth.indexOf("age_gate_signup"));
});

test("Google signup cannot bypass the same acceptance", () => {
  assert.match(signup, /legalSignup/);
  assert.match(google, /prepareGoogleSignupLegalAcceptance/);
  assert.match(google, /entry: "signup"/);
  assert.match(callback, /verifyLegalAcceptanceIntent/);
  assert.match(callback, /record_my_google_signup_legal_acceptance/);
  assert.match(callback, /\/sign-up\?legal=required/);
});

test("legal acceptance records are versioned and user-private", () => {
  assert.match(migration, /create table if not exists public\.legal_acceptances/);
  assert.match(migration, /unique \(user_id, terms_version, privacy_version\)/);
  assert.match(migration, /legal_acceptances_read_own/);
  assert.match(migration, /user_id = auth\.uid\(\)/);
  assert.match(migration, /capture_signup_legal_acceptance/);
  assert.match(migration, /record_my_google_signup_legal_acceptance/);
});
