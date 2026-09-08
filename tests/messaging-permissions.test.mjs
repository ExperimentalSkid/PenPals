import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../supabase/migrations/20260901030000_add_messaging.sql", import.meta.url), "utf8");
test("messaging migration defines participant-only read and send policies", () => {
  assert.match(migration, /Participants read conversations/);
  assert.match(migration, /Participants read messages/);
  assert.match(migration, /Participants send messages/);
  assert.match(migration, /sender_id = \(select auth\.uid\(\)\)/);
});
test("conversation creation rejects either-direction blocks", () => {
  assert.match(migration, /blocker_id = me and blocked_id = other_user/);
  assert.match(migration, /blocker_id = other_user and blocked_id = me/);
});
