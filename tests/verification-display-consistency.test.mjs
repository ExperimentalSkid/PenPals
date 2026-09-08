import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("verification display state matches the current, unrevoked verification window", async () => {
  const display = await read("src/lib/verification/display.ts");
  assert.match(display, /record\.status !== "verified"/);
  assert.match(display, /record\.revoked_at/);
  assert.match(display, /reverifyAfter > now\.getTime\(\)/);
  assert.match(display, /needsVerificationRefresh/);
  assert.match(display, /verificationDisplayState/);
  assert.match(display, /linked_not_eligible/);
});

test("Settings uses the shared current verification state", async () => {
  const settings = await read("src/app/app/settings/page.tsx");
  assert.match(settings, /from "@\/lib\/verification\/display"/);
  assert.match(settings, /isCurrentVerification/);
  assert.match(settings, /needsVerificationRefresh/);
  assert.match(settings, /const verificationState = verificationDisplayState\(activeVerification, now\)/);
  assert.match(settings, /verificationState === "verified" \? "Verified"/);
});

test("public profiles expose only the provider-neutral boolean", async () => {
  const profileView = await read("src/app/app/profile/[username]/ProfileView.tsx");
  const profilePage = await read("src/app/app/profile/[username]/page.tsx");
  assert.match(profileView, /profile\.is_verified/);
  assert.match(profileView, /Verified/);
  assert.doesNotMatch(profileView, /provider_subject|verified_at|reverify_after|external_account_verifications/i);
  assert.doesNotMatch(profilePage, /external_account_verifications|provider_subject|verified_at/);
});

test("Admin shows current status separately from private provider records", async () => {
  const admin = await read("src/app/app/admin/users/[id]/page.tsx");
  assert.match(admin, /verificationDisplayLabel/);
  assert.match(admin, /const verificationState = verificationDisplayState\(verificationRecords\)/);
  assert.match(admin, /Current: \$\{verificationDisplayLabel\(verificationState\)\}/);
  assert.match(admin, /Current state: \{verificationDisplayLabel\(verificationDisplayState\(\[record\]\)\)\}/);
  assert.match(admin, /admin_get_user_verification/);
  assert.match(admin, /Provider identity data is restricted to administrators/);
});
