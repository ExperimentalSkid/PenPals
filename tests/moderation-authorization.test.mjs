import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../supabase/migrations/20260901130000_add_moderator_authorization.sql", import.meta.url), "utf8");

test("roles default to user and are guarded from client promotion", () => {
  assert.match(sql, /role text not null default 'user'/);
  assert.match(sql, /new\.role := 'user'/);
  assert.match(sql, /Role changes require administrator authorization/);
});
test("ordinary users cannot access moderation data", () => {
  assert.match(sql, /public\.is_moderator\(\)/);
  assert.match(sql, /create policy "Moderators read reports"/);
  assert.match(sql, /create policy "Moderators read audit log"/);
});
test("moderators can update only report status and changes are audited", () => {
  assert.match(sql, /Moderators update report status/);
  assert.match(sql, /Only report status may be changed/);
  assert.match(sql, /moderation_audit_log/);
  assert.match(sql, /old_status, new_status/);
});
test("admins alone can change roles and cannot self-promote", () => {
  assert.match(sql, /role = 'admin'/);
  assert.match(sql, /target_user = auth\.uid\(\)/);
  assert.match(sql, /Administrator authorization required/);
});
test("moderators can review preserved report targets through a protected RPC", () => {
  assert.match(sql, /get_report_details/);
  assert.match(sql, /target_profile_id/);
  assert.match(sql, /target_introduction_id/);
  assert.match(sql, /target_message_id/);
});
