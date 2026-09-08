import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const [authActions, googleCallback, emailConfirm, appLayout, sessionProxy, appealPage, appealActions, profileActions, ageAppealMigration] = await Promise.all([
  read("src/app/auth/actions.ts"),
  read("src/app/auth/callback/route.ts"),
  read("src/app/auth/confirm/page.tsx"),
  read("src/app/app/layout.tsx"),
  read("src/lib/supabase/proxy.ts"),
  read("src/app/age-appeal/page.tsx"),
  read("src/app/age-appeal/actions.ts"),
  read("src/app/app/profile/actions.ts"),
  read("supabase/migrations/20260903100000_fix_pre_account_age_appeal_lifecycle.sql"),
]);

test("email signup and Google login apply the same restricted-user gate", () => {
  assert.match(authActions, /supabase\.rpc\("age_gate_signup"/);
  assert.match(authActions, /supabase\.rpc\("is_current_user_age_restricted"/);
  assert.match(authActions, /if \(ageRestricted\) redirect\("\/age-appeal"\)/);
  assert.match(googleCallback, /db\.rpc\("is_current_user_age_restricted"\)/);
  assert.match(googleCallback, /if \(ageRestricted\) return destination\(request, "\/age-appeal"/);
  assert.ok(authActions.indexOf("is_current_user_age_restricted") < authActions.indexOf('redirect("/app")'), "email sign-in must gate before entering the app");
  assert.ok(googleCallback.indexOf("is_current_user_age_restricted") < googleCallback.indexOf('if (!profile) return destination(request, "/app/profile/setup")'), "Google login must gate before setup/app routing");
});

test("email confirmation cannot enter the app before confirmation and protected setup", () => {
  assert.match(emailConfirm, /auth\.verifyOtp/);
  assert.match(emailConfirm, /exchangeCodeForSession/);
  assert.match(emailConfirm, /userData\.user\?\.email_confirmed_at/);
  assert.match(emailConfirm, /router\.replace\("\/app\/profile\/setup"\)/);
  assert.match(appLayout, /if \(!userData\.user\?\.email_confirmed_at\) redirect\("\/check-email"\)/);
  assert.match(appLayout, /db\.rpc\("is_current_user_age_restricted"\)/);
  assert.match(appLayout, /if \(ageRestricted\) redirect\("\/age-appeal"\)/);
});

test("returning sessions and direct URLs cannot bypass profile completion", () => {
  assert.match(sessionProxy, /request\.nextUrl\.pathname !== "\/app\/profile\/setup"/);
  assert.match(sessionProxy, /hasCompletedProfile/);
  assert.match(sessionProxy, /new URL\("\/app\/profile\/setup", request\.url\)/);
  assert.match(profileActions, /supabase\.rpc\("save_profile"/);
  assert.match(profileActions, /saveResult === "underage"/);
  assert.match(profileActions, /saveResult === "restricted" \|\| saveResult === "cooldown"/);
});

test("restricted users have a separate, self-authenticated appeal state without an app redirect loop", () => {
  assert.match(appealPage, /Age correction/);
  assert.match(appealPage, /href="\/sign-in"/);
  assert.match(appealPage, /submitAgeAppeal/);
  assert.match(appealActions, /submit_age_appeal/);
  assert.match(ageAppealMigration, /is_current_user_age_restricted/);
  assert.match(ageAppealMigration, /auth\.users u/);
  assert.match(ageAppealMigration, /u\.id = auth\.uid\(\)/);
  assert.doesNotMatch(appealPage, /redirect\("\/app/);
});
