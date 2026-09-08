import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20260903142000_harden_low_risk_database_functions.sql", root), "utf8");
const envText = await readFile(new URL(".env.local", root), "utf8").catch(() => "");

function envValue(name) {
  const line = envText.split(/\r?\n/).find((entry) => entry.startsWith(`${name}=`));
  return process.env[name] || line?.slice(name.length + 1).trim() || "";
}

const supabaseUrl = envValue("NEXT_PUBLIC_SUPABASE_URL");
const publishableKey = envValue("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
const hasLocalDatabase = (() => {
  try {
    execFileSync("docker", ["inspect", "supabase_db_Penpal"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

test("low-risk hardening keeps trigger execution internal and public profiles narrow", () => {
  assert.match(migration, /revoke execute on function public\.set_updated_at\(\) from anon/);
  assert.match(migration, /select\s+p0\.id[\s\S]*p0\.avatar_path\s+into p/);
  assert.doesNotMatch(migration, /select\s+p0\.\*\s+into p/);
  assert.match(migration, /grant execute on function public\.get_public_profile\(text\) to authenticated/);
});

test("low-risk hardening preserves authenticated profile reads while denying anonymous trigger RPC access", { skip: !hasLocalDatabase || !supabaseUrl || !publishableKey }, async () => {
  const db = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data: signIn, error: signInError } = await db.auth.signInWithPassword({
    email: "mika@example.local",
    password: process.env.PENPAL_LOCAL_TEST_PASSWORD || "demo",
  });
  assert.equal(signInError, null);
  assert.ok(signIn.session);

  const { data: profile, error: profileError } = await db.rpc("get_public_profile", { target_username: "sofia" });
  assert.equal(profileError, null);
  assert.ok(profile);
  assert.equal(typeof profile.display_name, "string");
  assert.equal("role" in profile, false);
  assert.equal("deactivated_at" in profile, false);

  const sql = `
select
  has_function_privilege('anon', 'public.set_updated_at()', 'execute') as anon_can_call,
  has_function_privilege('authenticated', 'public.set_updated_at()', 'execute') as authenticated_can_trigger,
  pg_get_functiondef('public.get_public_profile(text)'::regprocedure) like '%p0.*%' as has_whole_row_projection;
`;
  const output = execFileSync("docker", ["exec", "-i", "supabase_db_Penpal", "psql", "-U", "postgres", "-d", "postgres", "-Atc", sql], { encoding: "utf8" }).trim();
  assert.equal(output, "f|t|f");
  await db.auth.signOut();
});
