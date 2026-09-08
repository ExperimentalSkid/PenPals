import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const sql = await readFile(new URL("../supabase/migrations/20260901070000_add_introduction_controls.sql", import.meta.url), "utf8");
test("valid introductions create opportunities after checks", () => { assert.match(sql, /insert into public\.response_opportunities/); assert.match(sql, /insert into public\.conversation_introductions/); });
test("self-contact and duplicate conversations are guarded", () => { assert.match(sql, /me = other_user/); assert.match(sql, /select cp\.conversation_id/); });
test("blocks and recipient settings are enforced", () => { assert.match(sql, /not accepting new conversations/); assert.match(sql, /blocker_id = me and blocked_id = other_user/); assert.match(sql, /blocker_id = other_user and blocked_id = me/); });
test("rate and repeated-introduction spam limits exist", () => { assert.match(sql, /interval '1 hour'/); assert.match(sql, />= 10/); assert.match(sql, /normalized_hash/); assert.match(sql, /interval '24 hours'/); assert.match(sql, />= 3/); });
test("existing conversations return before new-introduction checks", () => { const existing = sql.indexOf("if conversation_id is not null then return conversation_id"); const blocks = sql.indexOf("if not recipient_accepts"); assert.ok(existing >= 0 && existing < blocks); });
