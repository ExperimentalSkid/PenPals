import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const sql = fs.readFileSync("supabase/migrations/20260901170000_add_private_photo_access.sql", "utf8");
const discovery = fs.readFileSync("supabase/migrations/20260901170100_hide_discovery_photo_paths.sql", "utf8");

test("photo access uses unique pending requests and grants", () => {
  assert.match(sql, /profile_photo_access_requests/);
  assert.match(sql, /profile_photo_pending_unique/);
  assert.match(sql, /profile_photo_access_grants/);
});

test("photo access is conversation, block, and owner controlled", () => {
  assert.match(sql, /conversation_participants/);
  assert.match(sql, /profile_blocks/);
  assert.match(sql, /requester_id = auth\.uid\(\)/);
  assert.match(sql, /r\.owner_id <> auth\.uid\(\)/);
  assert.match(sql, /revoke_photo_access/);
});

test("storage and discovery do not expose ungranted photo paths", () => {
  assert.match(sql, /can_view_profile_photo/);
  assert.match(sql, /View permitted avatars/);
  assert.match(discovery, /null::text/);
});
