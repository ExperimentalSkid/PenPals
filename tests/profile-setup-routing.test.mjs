import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const [setupPage, profileActions, profilePage, appPage, appNavigation, proxy, googleCallback, completeness, proxyEntrypoint] = await Promise.all([
  read("src/app/app/profile/setup/page.tsx"),
  read("src/app/app/profile/actions.ts"),
  read("src/app/app/profile/[username]/page.tsx"),
  read("src/app/app/page.tsx"),
  read("src/app/app/AppNavigation.tsx"),
  read("src/lib/supabase/proxy.ts"),
  read("src/app/auth/callback/route.ts"),
  read("src/lib/profile-completeness.ts"),
  read("src/proxy.ts"),
]);

test("incomplete authenticated profiles enter setup while completed saves exit to the app", () => {
  assert.match(proxyEntrypoint, /export function proxy/);
  assert.match(proxyEntrypoint, /"\/app\/:path\*"[\s\S]*"\/auth\/:path\*"/);
  assert.match(proxy, /if \(!isBootstrapAdmin\)/);
  assert.match(proxy, /const profileComplete = Boolean\(completionProfile && hasCompletedProfile/);
  assert.match(proxy, /!profileComplete && request\.nextUrl\.pathname !== "\/app\/profile\/setup"/);
  assert.match(proxy, /new URL\("\/app\/profile\/setup", request\.url\)/);
  assert.match(googleCallback, /if \(!profile\) return destination\(request, "\/app\/profile\/setup"\)/);
  assert.match(googleCallback, /!hasCompletedProfile\(profile/);
  assert.match(proxy, /profile\?\.role === "admin" && profile\?\.username === "admin"/);
  assert.match(googleCallback, /profile\?\.role === "admin" && profile\.username === "admin"/);
  assert.match(profileActions, /redirect\(existingProfile \? "\/app" : "\/app\/welcome"\)/);
  assert.match(completeness, /export function hasCompletedProfile/);
  assert.match(completeness, /export function profileCompletionProgress/);
  assert.match(setupPage, /profileCompletionProgress\(profile \?\? \{\}, selectedLanguages\.length, selectedInterests\.length\)/);
  assert.match(setupPage, /percent: completeness/);
});

test("setup remains a valid edit destination for completed profiles without trapping them", () => {
  assert.match(setupPage, /entryComplete \? t\("app\.profile\.editProfile"\) : t\("app\.profile\.setUpProfile"\)/);
  assert.match(appNavigation, /href: "\/app\/profile\/setup", label: t\("app\.nav\.profile"\)/);
  assert.match(appPage, /redirect\('\/app\/discover'\)/);
  assert.match(setupPage, /app\.profile\.viewPublic/);
  assert.match(setupPage, /\?from=setup/);
});

test("viewing the public profile from setup preserves a return link to profile editing", () => {
  assert.match(profilePage, /navigation\.from === "setup"/);
  assert.match(profilePage, /\? "\/app\/profile\/setup"/);
  assert.match(profilePage, /app\.profile\.backEditing/);
  assert.match(profilePage, /navigation\.from === "conversation"/);
  assert.match(profilePage, /navigation\.from === "introductions"/);
  assert.match(profilePage, /\/app\/discover/);
});

test("successful setup actions and setup errors stay in the setup context", () => {
  assert.match(profileActions, /profileErrorRedirect\(/);
  assert.match(profileActions, /`\/app\/profile\/setup\?error=/);
  assert.match(profileActions, /redirect\(existingProfile \? "\/app" : "\/app\/welcome"\)/);
  assert.match(setupPage, /searchParams: Promise<\{ error\?: string; appeal\?: string \}>/);
  assert.match(setupPage, /role="alert"/);
});
