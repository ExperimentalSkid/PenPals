import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const settings = await readFile(new URL("../src/app/app/settings/page.tsx", import.meta.url), "utf8");
const accountActions = await readFile(new URL("../src/app/app/settings/AccountActions.tsx", import.meta.url), "utf8");

test("Settings exposes the complete workspace navigation without duplicating controls", () => {
  for (const key of ["privacyAvailability", "profileDisplay", "communication", "verification", "blockedUsers", "yourData", "account"]) {
    assert.match(settings, new RegExp(`app\\.settings\\.${key}`));
  }
  for (const id of ["privacy-availability", "profile-display", "communication", "verification", "your-data", "account"]) {
    assert.match(settings, new RegExp(`id=\"${id}\"`));
  }
  assert.equal((settings.match(/name="allow_instant_messages"/g) ?? []).length, 1);
  assert.equal((settings.match(/name="allow_snail_mail"/g) ?? []).length, 1);
  assert.equal((settings.match(/name="inactive_mode"/g) ?? []).length, 1);
});

test("Settings workspace uses responsive navigation and a wider desktop content region", () => {
  assert.match(settings, /max-w-6xl/);
  assert.match(settings, /lg:grid-cols-\[210px_minmax\(0,1fr\)\]/);
  assert.match(settings, /grid-cols-2/);
  assert.match(settings, /sm:grid-cols-3/);
  assert.match(settings, /lg:block/);
});

test("account and data actions remain visibly separated from ordinary preferences", () => {
  assert.match(settings, /id="your-data"[\s\S]*app\.settings\.deleteAccount/);
  assert.match(settings, /id="account"[\s\S]*AccountActions/);
  assert.match(accountActions, /app\.settings\.deactivate/);
  assert.match(settings, /id="your-data"[\s\S]*id="account"/);
});

test("staff account status changes require an explicit confirmation checkbox", async () => {
  const actions = await readFile(new URL("../src/app/app/admin/actions.ts", import.meta.url), "utf8");
  const userActions = await readFile(new URL("../src/app/app/admin/users/[id]/AdminUserActions.tsx", import.meta.url), "utf8");
  assert.match(userActions, /name="confirm_status_change"/);
  assert.match(userActions, /required/);
  assert.match(actions, /confirm_status_change/);
  assert.match(actions, /Confirm the account status change before saving/);
});
