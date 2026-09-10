import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL("../supabase/migrations/20260902211000_photo_access_notifications.sql", import.meta.url),
  "utf8",
);
const page = await readFile(
  new URL("../src/app/app/notifications/page.tsx", import.meta.url),
  "utf8",
);

test("photo access notifications are generated only for actionable request states", () => {
  assert.match(migration, /new\.status = 'pending'/);
  assert.match(migration, /new\.status = 'allowed'/);
  assert.match(migration, /photo_access_request/);
  assert.match(migration, /photo_access_granted/);
  assert.match(migration, /on conflict do nothing/);
});

test("notification tray resolves photo requests to their conversation", () => {
  assert.match(page, /photo_access_request/);
  assert.match(page, /photo_access_granted/);
  assert.match(page, /profile_photo_access_requests/);
  assert.match(page, /request\?\.conversation_id/);
});

test("notification query failures are surfaced instead of looking empty", () => {
  assert.match(page, /notificationsError/);
  assert.match(page, /app\.notifications\.loadError/);
  assert.match(page, /!notificationsError && !notifications\.length/);
});
