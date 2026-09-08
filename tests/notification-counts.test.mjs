import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const page = await readFile(new URL("src/app/app/notifications/page.tsx", root), "utf8");
const layout = await readFile(new URL("src/app/app/layout.tsx", root), "utf8");
const navigation = await readFile(new URL("src/app/app/AppNavigation.tsx", root), "utf8");
const countMigration = await readFile(new URL("supabase/migrations/20260904130000_align_notification_unread_count.sql", root), "utf8");

const activeTypes = [
  "new_introduction",
  "introduction_replied",
  "introduction_declined",
  "photo_access_request",
  "photo_access_granted",
];

test("desktop and mobile navigation receive the same server-authoritative count", () => {
  assert.match(layout, /rpc\("unread_notification_count"\)/);
  assert.match(layout, /<AppNavigation unreadCount=\{Number\(unreadCount \?\? 0\)\} modInboxCount=\{modInboxCount\} supportInboxCount=\{Number\(supportInboxCount \?\? 0\)\} role=\{role\} \/>/);
  assert.match(layout, /<AppNavigation unreadCount=\{Number\(unreadCount \?\? 0\)\} modInboxCount=\{modInboxCount\} supportInboxCount=\{Number\(supportInboxCount \?\? 0\)\} role=\{role\} mobile \/>/);
  assert.match(navigation, /badge: unreadCount/);
  assert.match(navigation, /badgeLabel: "unread notifications"/);
});

test("the database count and Notifications page use the same unread actionable set", () => {
  assert.match(page, /\.is\("read_at", null\)/);
  assert.match(page, /\.in\("type", ACTIVE_TYPES\)/);
  assert.match(page, /const unreadCount = notifications\.length/);
  for (const type of activeTypes) assert.match(countMigration, new RegExp(`'${type}'`));
  assert.match(countMigration, /read_at is null/);
  assert.doesNotMatch(countMigration, /type <> 'new_message'/);
  assert.doesNotMatch(countMigration, /photo_access_revoked/);
});

test("read actions remove rows from every unread count without affecting other users", () => {
  assert.match(page, /\.update\(\{ read_at: new Date\(\)\.toISOString\(\) \}\)/);
  assert.match(page, /\.eq\("id", notification\.id\)/);
  assert.match(page, /\.eq\("user_id", uid\)/);
  assert.match(countMigration, /where user_id = auth\.uid\(\)/);
  assert.match(countMigration, /public\.is_email_verified\(\)/);
});
