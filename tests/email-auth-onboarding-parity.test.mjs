import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const [authActions, signUpPage, confirmPage, appLayout, sessionProxy, profileActions, setupPage, profileCompleteness, ageGate] = await Promise.all([
  read("src/app/auth/actions.ts"),
  read("src/app/sign-up/page.tsx"),
  read("src/app/auth/confirm/ConfirmEmailClient.tsx"),
  read("src/app/app/layout.tsx"),
  read("src/lib/supabase/proxy.ts"),
  read("src/app/app/profile/actions.ts"),
  read("src/app/app/profile/setup/page.tsx"),
  read("src/lib/profile-completeness.ts"),
  read("supabase/migrations/20260902180000_age_gate_and_appeals.sql"),
]);

test("email signup applies the age gate before creating the Auth account", () => {
  const signup = authActions.slice(authActions.indexOf("export async function signUp"), authActions.indexOf("export async function resendVerificationEmail"));
  assert.match(signUpPage, /name="birth_date" type="date"/);
  assert.match(signup, /p_birth_date: birthDate \|\| null/);
  assert.match(signup, /supabase\.rpc\("age_gate_signup"/);
  assert.ok(signup.indexOf("age_gate_signup") < signup.indexOf("supabase\.auth\.signUp"), "age gate must run before Auth account creation");
  assert.match(signup, /ageResult === "underage"/);
  assert.match(signup, /ageResult === "restricted"/);
  assert.match(signup, /ageResult === "cooldown"/);
  assert.match(signup, /redirect\("\/check-email"\)/);
});

test("email confirmation enters the same protected setup flow as Google login", () => {
  assert.match(confirmPage, /auth\.verifyOtp/);
  assert.match(confirmPage, /exchangeCodeForSession/);
  assert.match(confirmPage, /auth\.getUser\(\)/);
  assert.match(confirmPage, /userData\.user\?\.email_confirmed_at/);
  assert.match(confirmPage, /confirmationDestination/);
  assert.match(confirmPage, /\/app\/profile\/setup/);
  assert.match(appLayout, /if \(!userData\.user\?\.email_confirmed_at\) redirect\("\/check-email"\)/);
  assert.match(appLayout, /is_current_user_age_restricted/);
  assert.match(appLayout, /if \(ageRestricted\) redirect\("\/age-appeal"\)/);
});

test("non-signup confirmations return through the normal protected app boundary", () => {
  assert.match(confirmPage, /export function confirmationDestination/);
  assert.match(confirmPage, /if \(type === "recovery"\) return "\/update-password"/);
  assert.match(confirmPage, /type === "email_change"[^\n]*\/app\/settings\?email=updated/);
  assert.match(confirmPage, /type === "email" \|\| type === "invite" \|\| type === "magiclink"/);
  assert.match(confirmPage, /const destination = confirmationDestination\(type\)/);
  assert.match(confirmPage, /router\.replace\(destination\)/);
  assert.match(appLayout, /if \(!userData\.user\?\.email_confirmed_at\) redirect\("\/check-email"\)/);
  assert.match(appLayout, /if \(ageRestricted\) redirect\("\/age-appeal"\)/);
  assert.match(appLayout, /if \(p\?\.deactivated_at\) redirect\("\/reactivate"\)/);
});

test("incomplete email accounts cannot bypass profile setup through direct app URLs", () => {
  assert.match(sessionProxy, /request\.nextUrl\.pathname !== "\/app\/profile\/setup"/);
  assert.match(sessionProxy, /hasCompletedProfile/);
  assert.match(sessionProxy, /new URL\("\/app\/profile\/setup", request\.url\)/);
  assert.match(profileCompleteness, /location_precision/);
  assert.match(profileActions, /supabase\.rpc\("save_profile"/);
  assert.match(profileActions, /saveResult === "underage"/);
  assert.match(profileActions, /saveResult === "restricted" \|\| saveResult === "cooldown"/);
  assert.match(setupPage, /saveProfile/);
});

test("server age validation remains authoritative for email and Google setup saves", () => {
  assert.match(ageGate, /create or replace function public\.age_gate_validate_current_user/);
  assert.match(ageGate, /age_result := public\.age_gate_validate_current_user\(p_birth_date\)/);
  assert.match(ageGate, /before insert or update of birth_date on public\.profiles/);
});
