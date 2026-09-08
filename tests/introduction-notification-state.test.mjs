import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const page = await readFile(new URL("src/app/app/notifications/page.tsx", root), "utf8");
const layout = await readFile(new URL("src/app/app/layout.tsx", root), "utf8");
const migration = await readFile(new URL("supabase/migrations/20260905100000_clear_handled_introduction_notifications.sql", root), "utf8");

test("handled introduction requests are removed from the notification page", () => {
  assert.match(page, /select\("id,sender_id,recipient_id,icebreaker,conversation_id_legacy,status"\)/);
  assert.match(page, /introduction\?\.status === "pending" && introduction\.recipient_id === uid/);
});

test("the app-shell badge applies the same handled-introduction filter", () => {
  assert.match(layout, /introduction\?\.status === "pending" && introduction\.recipient_id === uid/);
});

test("the database trigger clears the recipient request and keeps the sender update", () => {
  assert.match(migration, /user_id = new\.recipient_id[\s\S]*type = 'new_introduction'[\s\S]*read_at = coalesce\(read_at, now\(\)\)/);
  assert.match(migration, /values \(new\.sender_id, 'introduction_replied'/);
  assert.match(migration, /values \(new\.sender_id, 'introduction_declined'/);
  assert.match(migration, /i\.status = 'pending'/);
});
