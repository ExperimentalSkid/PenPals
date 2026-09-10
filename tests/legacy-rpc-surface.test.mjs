import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { LOCAL_DB_CONTAINER } from "./helpers/local-db.mjs";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20260903140000_restrict_obsolete_compatibility_rpcs.sql", root), "utf8");
const profileSaveMigration = await readFile(new URL("supabase/migrations/20260903141000_restrict_legacy_profile_save_overload.sql", root), "utf8");
const currentSources = await Promise.all([
  readFile(new URL("src/app/app/admin/users/[id]/page.tsx", root), "utf8"),
  readFile(new URL("src/app/app/admin/age-appeals/page.tsx", root), "utf8"),
  readFile(new URL("src/app/app/admin/audit/page.tsx", root), "utf8"),
  readFile(new URL("src/app/app/profile/actions.ts", root), "utf8"),
]);

const hasLocalDatabase = (() => {
  try { execFileSync("docker", ["inspect", LOCAL_DB_CONTAINER], { stdio: "ignore" }); return true; } catch { return false; }
})();

test("obsolete compatibility RPCs have no current application callers", () => {
  const source = currentSources.join("\n");
  assert.doesNotMatch(source, /rpc\("admin_list_age_appeals"/);
  assert.doesNotMatch(source, /rpc\("admin_get_user_detail_legacy"/);
  assert.doesNotMatch(source, /rpc\("admin_list_users"/);
  assert.match(source, /p_inactive_mode/);
  assert.match(source, /rpc\("save_profile"/);
  assert.match(source, /rpc\("admin_list_audit_entries"/);
  assert.match(source, /from_date/);
  for (const signature of [
    "admin_get_user_detail_legacy(uuid)",
    "admin_list_age_appeals(text)",
    "admin_list_audit_entries(text, uuid, integer, integer)",
    "admin_list_users(text, text, text, text)",
    "save_privacy_settings(text, boolean, boolean, boolean, boolean, text, text, text[])",
    "save_profile(text, text, date, text, text, text, text, text, text, jsonb, bigint[])",
  ]) {
    const escaped = signature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(`${migration}\n${profileSaveMigration}`, new RegExp(`revoke all on function public\\.${escaped}`));
  }
});

test("obsolete compatibility RPCs are denied while the current surface remains usable", { skip: !hasLocalDatabase }, () => {
  for (const signature of [
    "admin_get_user_detail_legacy(uuid)",
    "admin_list_age_appeals(text)",
    "admin_list_audit_entries(text, uuid, integer, integer)",
    "admin_list_users(text, text, text, text)",
    "save_privacy_settings(text, boolean, boolean, boolean, boolean, text, text, text[])",
    "save_profile(text, text, date, text, text, text, text, text, text, jsonb, bigint[])",
  ]) {
    const result = execFileSync("docker", ["exec", LOCAL_DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-Atc", `select has_function_privilege('authenticated', 'public.${signature}', 'execute')`], { encoding: "utf8" }).trim();
    assert.equal(result, "f", `${signature} retained an authenticated EXECUTE grant`);
  }

  const userId = execFileSync("docker", ["exec", LOCAL_DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-Atc", "select p.id from public.profiles p join auth.users u on u.id=p.id where p.deactivated_at is null and u.email_confirmed_at is not null order by (p.role='user') desc, p.created_at limit 1"], { encoding: "utf8" }).trim();
  assert.match(userId, /^[0-9a-f-]{36}$/i, "a verified local user fixture is required");
  const sql = `begin;
select set_config('request.jwt.claim.sub','${userId}',true);
select set_config('request.jwt.claim.role','authenticated',true);
select count(*) >= 0 from public.get_discover_profiles();
rollback;`;
  const usable = execFileSync("docker", ["exec", "-i", LOCAL_DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atc", sql], { encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean);
  assert.ok(usable.includes("t"), "active discovery RPC was restricted unexpectedly");
});
