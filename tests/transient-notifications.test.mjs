import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL("../supabase/migrations/20260902150000_transient_notifications.sql", import.meta.url),
  "utf8",
);
const page = await readFile(
  new URL("../src/app/app/notifications/page.tsx", import.meta.url),
  "utf8",
);

test("message notifications are removed from the active notification stream", () => {
  assert.match(migration, /drop trigger if exists messages_notifications/);
  assert.match(migration, /drop function if exists public\.notify_message/);
  assert.match(migration, /type <> 'new_message'/);
});

test("notification tray only queries unread useful events", () => {
  assert.match(page, /\.is\("read_at", null\)/);
  assert.match(page, /\.in\("type", ACTIVE_TYPES\)/);
  assert.match(page, /You&apos;re all caught up\./);
  assert.doesNotMatch(page, /Mark as read/);
});

test("opening a notification marks only the current user's row read before routing", () => {
  assert.match(page, /\.eq\("user_id", uid\)/);
  assert.match(page, /\.update\(\{ read_at: new Date\(\)\.toISOString\(\) \}\)/);
  assert.match(page, /\.is\("read_at", null\)/);
  assert.match(page, /openNotification\.bind\(null, notification\.id\)/);
});
