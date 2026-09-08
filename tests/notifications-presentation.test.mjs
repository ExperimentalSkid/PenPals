import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../src/app/app/notifications/page.tsx", import.meta.url), "utf8");
const sort = await readFile(new URL("../src/app/app/notifications/NotificationSort.tsx", import.meta.url), "utf8");

test("Notifications presents the approved updates hierarchy and filters", () => {
  assert.match(page, /Your updates/);
  assert.match(page, /Introductions and important updates, kept brief/);
  for (const label of ["All", "Unread", "Requests", "Updates"]) assert.match(page, new RegExp(label));
  assert.match(sort, /Newest first/);
  assert.match(sort, /Oldest first/);
  assert.match(sort, /requestSubmit/);
});

test("notification rows use real event data, authorized identity and useful actions", () => {
  assert.match(page, /New introduction from/);
  assert.match(page, /accepted your photo request/);
  assert.match(page, /replied to your conversation/);
  assert.match(page, /resolve_profile_identity/);
  assert.match(page, /can_view_profile_photo/);
  assert.match(page, /createSignedUrl/);
  assert.match(page, /openNotification\.bind\(null, notification\.id\)/);
  assert.match(page, /Open introduction/);
  assert.match(page, /Open conversation/);
  assert.match(page, /Review request/);
  assert.match(page, /Manage preferences/);
});

test("message notifications remain out of the active notification stream", () => {
  assert.match(page, /ACTIVE_TYPES/);
  assert.doesNotMatch(page, /ACTIVE_TYPES = \[[^\]]*new_message/);
  assert.match(page, /You&apos;re all caught up\./);
});

test("notification presentation stays responsive and privacy-safe", () => {
  assert.match(page, /lg:grid-cols-\[minmax\(0,1fr\)_292px\]/);
  assert.match(page, /sm:grid-cols-\[minmax\(0,1fr\)_auto\]/);
  assert.match(page, /profile photo unavailable/);
  assert.match(page, /Deleted user/);
});
