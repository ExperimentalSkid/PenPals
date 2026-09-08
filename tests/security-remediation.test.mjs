import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../supabase/migrations/20260902120000_security_remediation.sql", import.meta.url), "utf8");
const systemMigration = await readFile(new URL("../supabase/migrations/20260902121000_security_remediation_system_acl.sql", import.meta.url), "utf8");
const profilePage = await readFile(new URL("../src/app/app/profile/[username]/page.tsx", import.meta.url), "utf8");

test("public profile RPC is an explicit privacy-safe allow-list", () => {
  assert.match(migration, /jsonb_build_object/);
  assert.doesNotMatch(migration, /return\s+to_jsonb\(p\)/i);
  assert.match(migration, /'avatar_path',\s*case[\s\S]*can_view_profile_photo/);
  assert.match(migration, /'activity_status',\s*case/);
  assert.match(migration, /'response_rate_label',\s*response_label/);
  for (const field of ["role", "profile_visibility", "show_activity_status", "show_response_rate", "deactivated_at", "created_at", "updated_at"]) {
    assert.doesNotMatch(migration, new RegExp(`['\\"]${field}['\\"]\\s*,`, "i"));
  }
});

test("profile page consumes sanitized activity and response values", () => {
  assert.match(profilePage, /profile\.activity_status/);
  assert.match(profilePage, /profile\.response_rate_label/);
  assert.doesNotMatch(profilePage, /get_response_stats/);
});

test("report targets require viewer authorization", () => {
  assert.match(migration, /viewer_can_access_profile\(p\.id\)/);
  assert.match(migration, /intro\.sender_id <> me and intro\.recipient_id <> me/);
  assert.match(migration, /target_conversation is null/);
  assert.match(migration, /conversation_participants/);
});

test("anonymous function execution is revoked and only app entry points are restored", () => {
  assert.match(migration, /revoke execute on function[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /revoke execute on function public\.expire_introductions\(\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.get_public_profile\(text\) to authenticated/);
  assert.match(migration, /grant execute on function public\.submit_report\(text, uuid, text, text, boolean\) to authenticated/);
  assert.match(systemMigration, /supabase_functions\.http_request\(\)/);
  assert.match(systemMigration, /revoke execute on function supabase_functions\.http_request\(\) from public, anon, authenticated/);
});

test("participant identity columns are protected by grants and a trigger", () => {
  assert.match(migration, /grant update \(last_read_at\) on table public\.conversation_participants to authenticated/);
  assert.match(migration, /Conversation membership is immutable/);
  assert.match(migration, /before update on public\.conversation_participants/);
});

test("report updates are status-only and preserve all target references", () => {
  assert.match(migration, /grant update \(status\) on table public\.reports to authenticated/);
  for (const field of ["id", "reporter_id", "target_type", "target_id", "target_profile_id", "target_introduction_id", "target_message_id", "reason", "details", "created_at"]) {
    assert.match(migration, new RegExp(`new\\.${field}\\s+is distinct from old\\.${field}`));
  }
  assert.match(migration, /Only report status may be changed/);
});

test("photo authorization always derives viewer from auth.uid", () => {
  const functionBody = migration.slice(migration.indexOf("create or replace function public.can_view_profile_photo"));
  assert.match(functionBody, /owner_user = auth\.uid\(\)/);
  assert.match(functionBody, /g\.viewer_id = auth\.uid\(\)/);
  assert.doesNotMatch(functionBody, /viewer_user\s*(?:=|\)|and|or)/i);
});

test("all SECURITY DEFINER routines are assigned the fixed search path", () => {
  assert.match(migration, /alter function %I\.%I\(%s\) set search_path = pg_catalog, public/);
  assert.match(migration, /set search_path = pg_catalog, public/);
  assert.match(systemMigration, /set search_path = pg_catalog, supabase_functions/);
});
