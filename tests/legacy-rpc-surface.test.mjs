import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20260903140000_restrict_obsolete_compatibility_rpcs.sql", root), "utf8");
const profileSaveMigration = await readFile(new URL("supabase/migrations/20260903141000_restrict_legacy_profile_save_overload.sql", root), "utf8");
const currentSources = await Promise.all([
  readFile(new URL("src/app/app/admin/users/[id]/page.tsx", root), "utf8"),
  readFile(new URL("src/app/app/admin/age-appeals/page.tsx", root), "utf8"),
  readFile(new URL("src/app/app/admin/audit/page.tsx", root), "utf8"),
  readFile(new URL("src/app/app/profile/actions.ts", root), "utf8"),
]);

const envText = await readFile(new URL(".env.local", root), "utf8").catch(() => "");
function envValue(name) {
  const line = envText.split(/\r?\n/).find((entry) => entry.startsWith(`${name}=`));
  return process.env[name] || line?.slice(name.length + 1).trim() || "";
}
const supabaseUrl = envValue("NEXT_PUBLIC_SUPABASE_URL");
const publishableKey = envValue("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
const hasLocalDatabase = (() => {
  try { execFileSync("docker", ["inspect", "supabase_db_Penpal"], { stdio: "ignore" }); return true; } catch { return false; }
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

test("obsolete compatibility RPCs are denied while the current surface remains usable", { skip: !hasLocalDatabase || !supabaseUrl || !publishableKey }, async () => {
  const db = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { error: signInError } = await db.auth.signInWithPassword({ email: "mika@example.local", password: process.env.PENPAL_LOCAL_TEST_PASSWORD || "demo" });
  assert.equal(signInError, null);

  const obsolete = [
    ["admin_list_age_appeals", { status_filter: "pending" }],
    ["admin_get_user_detail_legacy", { target_user: crypto.randomUUID() }],
    ["admin_list_audit_entries", { action_filter: null, actor_filter: null, page_size: 10, page_offset: 0 }],
    ["admin_list_users", { search_query: null, status_filter: "all", role_filter: "all", completeness_filter: "all" }],
  ];
  for (const [name, args] of obsolete) {
    const { error } = await db.rpc(name, args);
    assert.ok(error, `${name} compatibility RPC unexpectedly remained client-callable`);
  }

  const { error: currentError } = await db.rpc("get_discover_profiles");
  assert.equal(currentError, null, "active compatibility discovery RPC was restricted unexpectedly");
  await db.auth.signOut();

  for (const signature of [
    "admin_get_user_detail_legacy(uuid)",
    "admin_list_age_appeals(text)",
    "admin_list_audit_entries(text, uuid, integer, integer)",
    "admin_list_users(text, text, text, text)",
    "save_privacy_settings(text, boolean, boolean, boolean, boolean, text, text, text[])",
    "save_profile(text, text, date, text, text, text, text, text, text, jsonb, bigint[])",
  ]) {
    const result = execFileSync("docker", ["exec", "supabase_db_Penpal", "psql", "-U", "postgres", "-d", "postgres", "-Atc", `select has_function_privilege('authenticated', 'public.${signature}', 'execute')`], { encoding: "utf8" }).trim();
    assert.equal(result, "f", `${signature} retained an authenticated EXECUTE grant`);
  }

  const adminId = execFileSync("docker", ["exec", "supabase_db_Penpal", "psql", "-U", "postgres", "-d", "postgres", "-Atc", "select id from auth.users where email = 'admin@example.com' limit 1"], { encoding: "utf8" }).trim();
  if (adminId) {
    const sql = `begin;
select set_config('request.jwt.claim.sub','${adminId}',true);
select set_config('request.jwt.claim.role','authenticated',true);
select public.admin_get_user_detail('${adminId}');
rollback;`;
    execFileSync("docker", ["exec", "-i", "supabase_db_Penpal", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atc", sql], { stdio: "ignore" });
  }
});
