import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../src/app/app/notifications/page.tsx", import.meta.url), "utf8");
const sort = await readFile(new URL("../src/app/app/notifications/NotificationSort.tsx", import.meta.url), "utf8");

test("Notifications presents the approved updates hierarchy and filters", () => {
  assert.match(page, /app\.notifications\.title/);
  assert.match(page, /app\.notifications\.intro/);
  for (const key of ["all", "unread", "requests", "updates"]) assert.match(page, new RegExp(`app\\.notifications\\.${key}`));
  assert.match(sort, /app\.notifications\.newest/);
  assert.match(sort, /app\.notifications\.oldest/);
  assert.match(sort, /requestSubmit/);
});

test("notification rows use real event data, authorized identity and useful actions", () => {
  assert.match(page, /app\.notifications\.newIntro/);
  assert.match(page, /app\.notifications\.photoGranted/);
  assert.match(page, /app\.notifications\.replied/);
  assert.match(page, /resolve_profile_identity/);
  assert.match(page, /can_view_profile_photo/);
  assert.match(page, /createSignedUrl/);
  assert.match(page, /openNotification\.bind\(null, notification\.id\)/);
  assert.match(page, /app\.notifications\.openIntro/);
  assert.match(page, /app\.notifications\.openConversation/);
  assert.match(page, /app\.notifications\.reviewRequest/);
  assert.match(page, /app\.notifications\.manage/);
});

test("message notifications remain out of the active notification stream", () => {
  assert.match(page, /ACTIVE_TYPES/);
  assert.doesNotMatch(page, /ACTIVE_TYPES = \[[^\]]*new_message/);
  assert.match(page, /app\.notifications\.caughtUp/);
});

test("notification presentation stays responsive and privacy-safe", () => {
  assert.match(page, /lg:grid-cols-\[minmax\(0,1fr\)_292px\]/);
  assert.match(page, /sm:grid-cols-\[minmax\(0,1fr\)_auto\]/);
  assert.match(page, /profile photo unavailable/);
  assert.match(page, /app\.notifications\.deletedUser/);
});
