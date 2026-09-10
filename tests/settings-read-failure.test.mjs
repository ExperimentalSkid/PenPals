import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const settings = await readFile(new URL("src/app/app/settings/page.tsx", root), "utf8");
const actions = await readFile(new URL("src/app/app/profile/actions.ts", root), "utf8");
const accountActions = await readFile(new URL("src/app/app/settings/AccountActions.tsx", root), "utf8");

test("Settings fails closed when profile or privacy reads fail", () => {
  assert.match(settings, /error: profileError/);
  assert.match(settings, /error: excludedError/);
  assert.match(settings, /if \(profileError \|\| excludedError \|\| !p\)/);
  assert.match(settings, /app\.settings\.loadError/);
  assert.match(settings, /role="alert"/);
  assert.match(settings, /name="settings_loaded" value="1"/);
  assert.doesNotMatch(settings, /profile_visibility\?\.\?\s*["']public/);
});

test("a save attempt after a failed or stale Settings read is rejected before the save RPC", () => {
  const start = actions.indexOf("export async function savePrivacy");
  const end = actions.indexOf("export async function deactivateAccount");
  assert.ok(start >= 0 && end > start);
  const block = actions.slice(start, end);
  const marker = block.indexOf('formData.get("settings_loaded")');
  const profileRead = block.indexOf('from("profiles").select');
  const exclusionsRead = block.indexOf('from("profile_introduction_country_exclusions").select');
  const rpc = block.indexOf('rpc("save_privacy_settings"');
  assert.ok(marker >= 0, "missing successful-read form marker");
  assert.ok(profileRead > marker, "profile preflight must follow the marker");
  assert.ok(exclusionsRead > profileRead, "privacy exclusions must be read before saving");
  assert.ok(rpc > exclusionsRead, "save RPC must run only after both preflight reads");
  assert.match(block, /privacyReadError \|\| !currentPrivacy/);
  assert.match(block, /exclusionsReadError/);
  assert.match(block, /server\.profile\.privacyLoad/);
});

test("self-deactivation requires explicit confirmation", () => {
  assert.match(accountActions, /window\.confirm/);
  assert.match(accountActions, /event\.preventDefault\(\)/);
  assert.match(accountActions, /deactivateAccount/);
});

test("administrator self-deactivation is unavailable in the UI", () => {
  assert.match(settings, /select\("username,role,/);
  assert.match(settings, /isAdmin=\{p\.role === "admin"\}/);
  assert.match(accountActions, /if \(isAdmin && !deactivated\)/);
  assert.match(accountActions, /app\.settings\.adminNoDeactivate/);
});

test("Settings does not present failed security-state reads as unverified states", () => {
  assert.match(settings, /error: totpStatusError/);
  assert.match(settings, /error: verificationSupplementError/);
  assert.match(settings, /verificationDataAvailable/);
  assert.match(settings, /app\.settings\.totpStatusUnavailable/);
  assert.match(settings, /app\.settings\.verificationStatusUnavailable/);
});
