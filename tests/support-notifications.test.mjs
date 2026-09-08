import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => fs.readFile(new URL(path, root), "utf8");

test("Support lifecycle uses the existing notification stream", async () => {
  const migration = await read("supabase/migrations/20260904232200_support_notifications.sql");
  for (const type of [
    "support_ticket_created",
    "support_ticket_user_reply",
    "support_ticket_public_reply",
    "support_ticket_resolved",
    "support_ticket_reopened",
  ]) assert.match(migration, new RegExp(`'${type}'`));
  assert.match(migration, /create or replace function public\.notify_support_ticket\(\)/);
  assert.match(migration, /create or replace function public\.notify_support_ticket_message\(\)/);
  assert.match(migration, /support_tickets_notifications/);
  assert.match(migration, /support_ticket_messages_notifications/);
  assert.match(migration, /if new\.is_internal then/);
  assert.match(migration, /role in \('moderator', 'admin'\)/);
  assert.match(migration, /support_ticket_public_reply/);
  assert.match(migration, /support_ticket_resolved/);
  assert.match(migration, /support_ticket_reopened/);
  const waitingUser = await read("supabase/migrations/20260904232400_support_waiting_user_notification.sql");
  assert.match(waitingUser, /support_ticket_waiting_user/);
  assert.match(waitingUser, /new\.status = 'waiting_user'/);
  assert.match(waitingUser, /not exists/);
  const countAlignment = await read("supabase/migrations/20260904232500_align_support_notification_count.sql");
  for (const type of ["support_ticket_created", "support_ticket_user_reply", "support_ticket_public_reply", "support_ticket_waiting_user", "support_ticket_resolved", "support_ticket_reopened"]) {
    assert.match(countAlignment, new RegExp(`'${type}'`));
  }
  assert.match(countAlignment, /unread_notification_count/);
  const initialGuard = await read("supabase/migrations/20260904232300_support_notifications_initial_guard.sql");
  assert.match(initialGuard, /initial ticket description/);
  assert.match(initialGuard, /m\.id <> new\.id/);
  assert.match(initialGuard, /support_ticket_user_reply/);
});

test("Support notifications are actionable for users and staff", async () => {
  const page = await read("src/app/app/notifications/page.tsx");
  assert.match(page, /support_ticket_created/);
  assert.match(page, /support_ticket_user_reply/);
  assert.match(page, /support_ticket_public_reply/);
  assert.match(page, /support_ticket_waiting_user/);
  assert.match(page, /support_ticket_resolved/);
  assert.match(page, /support_ticket_reopened/);
  assert.match(page, /is_moderator/);
  assert.match(page, /\/app\/admin\/support\/\$\{notification\.related_id\}/);
  assert.match(page, /\/app\/support\/requests\/\$\{notification\.related_id\}/);
  assert.match(page, /Open support ticket/);
  assert.match(page, /Open support request/);
});
