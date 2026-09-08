import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const [actions, button, callback, settings, settingsActions, verificationCallback, verificationStart, readme, googleHelper, supabaseConfig, home, sessionProxy] = await Promise.all([
  read("src/app/auth/actions.ts"),
  read("src/app/auth/GoogleAuthButton.tsx"),
  read("src/app/auth/callback/route.ts"),
  read("src/app/app/settings/page.tsx"),
  read("src/app/app/settings/data-actions.ts"),
  read("src/app/auth/verification/[provider]/callback/route.ts"),
  read("src/app/auth/verification/[provider]/start/route.ts"),
  read("README.md"),
  read("src/lib/auth/google-login.ts"),
  read("supabase/config.toml"),
  read("src/app/page.tsx"),
  read("src/lib/supabase/proxy.ts"),
]);

test("signed-out front page exposes direct sign-in and account-creation actions", () => {
  assert.match(home, /href="\/sign-in"/);
  assert.match(home, /Sign in/);
  assert.match(home, /href="\/sign-up"/);
  assert.match(home, /Join (?:Penpal|pen-pals\.net|free)/);
  assert.match(home, /flex-wrap/);
  assert.match(home, /sm:px-10/);
});

test("Google login is offered independently on sign-in and sign-up", async () => {
  const signIn = await read("src/app/sign-in/page.tsx");
  const signUp = await read("src/app/sign-up/page.tsx");
  assert.match(signIn, /GoogleAuthButton/);
  assert.match(signUp, /GoogleAuthButton/);
  assert.match(button, /signInWithOAuth/);
  assert.match(button, /provider: "google"/);
  assert.match(button, /scopes: "openid email"/);
  assert.match(button, /skipBrowserRedirect: true/);
  assert.match(button, /\/auth\/callback/);
  assert.match(supabaseConfig, /auth\/callback/);
});

test("local Supabase Google provider is enabled and credentials stay environment-bound", () => {
  assert.match(supabaseConfig, /\[auth\.external\.google\][\s\S]*?enabled = true/);
  assert.match(supabaseConfig, /client_id = "env\(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID\)"/);
  assert.match(supabaseConfig, /secret = "env\(SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET\)"/);
  assert.match(supabaseConfig, /enable_manual_linking = true/);
});

test("Auth callback handles PKCE, email/age/deactivation gates, setup, and safe next paths", () => {
  assert.match(callback, /exchangeCodeForSession/);
  assert.match(callback, /sb_flow_id/);
  assert.match(callback, /email_confirmed_at/);
  assert.match(callback, /is_current_user_age_restricted/);
  assert.match(callback, /deactivated_at/);
  assert.match(callback, /\/reactivate/);
  assert.match(callback, /\/app\/profile\/setup/);
  assert.match(callback, /safeNext/);
  assert.match(callback, /startsWith\("\/\/"\)/);
  assert.match(callback, /Google sign-in couldn't be completed/);
});

test("Auth callback preserves the safe local origin used to start OAuth", () => {
  assert.match(callback, /function redirectOrigin\(request: NextRequest\)/);
  assert.match(callback, /x-forwarded-host/);
  assert.match(callback, /\["localhost", "127\.0\.0\.1", "::1", "\[::1\]"\]/);
  assert.match(callback, /candidate === configuredOrigin \|\| \(!configuredOrigin && localAlias\)/);
  assert.match(callback, /new URL\(path, redirectOrigin\(request\)\)/);
});

test("Google login routes missing or incomplete profiles through setup", () => {
  assert.match(callback, /is_current_user_age_restricted/);
  assert.match(callback, /if \(!profile\) return destination\(request, "\/app\/profile\/setup"\)/);
  assert.match(callback, /hasCompletedProfile/);
  assert.match(callback, /profile_languages/);
  assert.match(callback, /profile_interests/);
  assert.match(callback, /if \(!hasCompletedProfile\(profile, languageCount \?\? 0, interestCount \?\? 0\)\) return destination\(request, "\/app\/profile\/setup"\)/);
  assert.match(callback, /return destination\(request, safeNext\(query\.get\("next"\)\)\)/);
  assert.ok(callback.indexOf("is_current_user_age_restricted") < callback.indexOf('if (!profile) return destination(request, "/app/profile/setup")'), "age gate must run before setup routing");
});

test("the app boundary cannot be bypassed before Google onboarding completes", () => {
  assert.match(sessionProxy, /request\.nextUrl\.pathname !== "\/app\/profile\/setup"/);
  assert.match(sessionProxy, /if \(!completionProfile \|\| !hasCompletedProfile\(completionProfile, languageCount \?\? 0, interestCount \?\? 0\)\)/);
  assert.match(sessionProxy, /new URL\("\/app\/profile\/setup", request\.url\)/);
  assert.match(sessionProxy, /select\("username,display_name,birth_date,country"\)/);
});

test("authenticated Google linking is identity-bound and cannot be an email merge", () => {
  assert.match(actions, /linkIdentity/);
  assert.match(actions, /getUserIdentities/);
  assert.match(googleHelper, /GOOGLE_LOGIN_STATE_SECRET/);
  assert.match(actions, /scopes: "openid email"/);
  assert.match(actions, /googleLoginCallbackUrl\("link", callbackOrigin\)/);
  assert.match(callback, /verifyGoogleLoginIntent/);
  assert.match(callback, /intendedUserId !== user\.id/);
  assert.match(settingsActions, /unlinkIdentity/);
  assert.match(settingsActions, /identities\.length < 2/);
  assert.match(readme, /never merges accounts from a matching email alone/i);
});

test("login methods and profile verification remain separate Settings surfaces", () => {
  assert.match(settings, /id="login-methods"/);
  assert.match(settings, /Connect Google/);
  assert.match(settings, /Disconnect Google/);
  assert.match(settings, /id="verification"/);
  assert.match(settings, /Verify your profile/);
  assert.match(settings, /Disconnect verification/);
  assert.match(settings, /startGoogleLink/);
  assert.match(settings, /disconnectVerification/);
  assert.doesNotMatch(callback, /is_verified|record_external_verification|revoke_my_external_verification/);
  assert.match(verificationStart, /encodeOAuthState/);
  assert.match(verificationCallback, /decodeOAuthState/);
  assert.match(verificationCallback, /record_external_verification/);

  const verificationDisconnect = settingsActions.slice(
    settingsActions.indexOf("export async function disconnectVerification"),
    settingsActions.indexOf("export async function disconnectGoogleLogin"),
  );
  const loginDisconnect = settingsActions.slice(
    settingsActions.indexOf("export async function disconnectGoogleLogin"),
    settingsActions.indexOf("export async function deleteAccount"),
  );
  assert.match(verificationDisconnect, /revoke_my_external_verification/);
  assert.doesNotMatch(verificationDisconnect, /unlinkIdentity|linkIdentity/);
  assert.match(loginDisconnect, /unlinkIdentity/);
  assert.doesNotMatch(loginDisconnect, /revoke_my_external_verification|record_external_verification/);
  const loginLink = actions.slice(
    actions.indexOf("export async function startGoogleLink"),
    actions.indexOf("export async function signOut"),
  );
  assert.match(loginLink, /linkIdentity/);
  assert.doesNotMatch(loginLink, /record_external_verification|revoke_my_external_verification/);
  assert.doesNotMatch(verificationStart, /linkIdentity|unlinkIdentity/);
  assert.doesNotMatch(verificationCallback, /linkIdentity|unlinkIdentity/);
});

test("Google identity linking keeps the same safe local origin as the Settings request", () => {
  assert.match(actions, /const requestHeaders = await headers\(\)/);
  assert.match(actions, /x-forwarded-host/);
  assert.match(actions, /configuredOrigin === "http:\/\/localhost:3000" && localAlias/);
  assert.match(actions, /googleLoginCallbackUrl\("link", callbackOrigin\)/);
  assert.match(googleHelper, /origin = verificationSiteUrl\(\)/);
});

test("login callback tampering and provider failures are generic and do not expose account details", () => {
  assert.match(callback, /mode === "link" && !intendedUserId/);
  assert.match(callback, /reason === "cancelled"/);
  assert.match(callback, /await db\.auth\.signOut\(\)/);
  assert.doesNotMatch(callback, /identity_data|provider_subject/);
  assert.match(button, /Google sign-in couldn't be completed/);
});
