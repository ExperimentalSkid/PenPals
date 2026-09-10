import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const root = new URL("../", import.meta.url);
const activityMigration = await readFile(new URL("../supabase/migrations/20260903000000_activity_ranks_and_inactive_mode.sql", import.meta.url), "utf8");
const lockMigration = await readFile(new URL("../supabase/migrations/20260903110000_restrict_presence_viewer_surface.sql", import.meta.url), "utf8");
const envText = (await readFile(new URL(".env.local", root), "utf8").catch(() => "")).replace(/\\n/g, "\n");

function envValue(name) {
  const line = envText.split(/\r?\n/).find((entry) => entry.startsWith(`${name}=`));
  return process.env[name] || line?.slice(name.length + 1).trim() || "";
}

const supabaseUrl = envValue("NEXT_PUBLIC_SUPABASE_URL");
const publishableKey = envValue("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");

test("the live presence policies do not depend on the target-dependent viewer RPC", () => {
  const readPolicy = activityMigration.slice(activityMigration.indexOf('create policy "Penpal presence read"'));
  assert.doesNotMatch(readPolicy, /realtime_presence_viewer/);
  assert.match(readPolicy, /target\.show_activity_status = true/);
  assert.match(readPolicy, /profile_blocks/);
  assert.match(lockMigration, /revoke all on function public\.realtime_presence_viewer\(uuid\)\s+from public, anon, authenticated/);
});

test("direct viewer authorization is not an authenticated client RPC", { skip: !supabaseUrl || !publishableKey }, async (t) => {
  const anon = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { error: anonError } = await anon.rpc("realtime_presence_viewer", { target: crypto.randomUUID() });
  assert.ok(anonError, "anonymous caller unexpectedly invoked the viewer helper");

  const user = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { error: signInError } = await user.auth.signInWithPassword({ email: "mika@example.local", password: process.env.PENPAL_LOCAL_TEST_PASSWORD || "demo" });
  if (signInError?.code === "invalid_credentials") { t.skip("local mika fixture is not seeded"); return; }
  assert.equal(signInError, null, signInError?.message || "fixture sign-in failed");
  const { error: userError } = await user.rpc("realtime_presence_viewer", { target: crypto.randomUUID() });
  assert.ok(userError, "authenticated caller unexpectedly invoked the viewer helper");
  await user.auth.signOut();
});

test("revoking the viewer RPC does not break the RLS policy path", { skip: !hasDocker() }, () => {
  const sql = "begin; revoke execute on function public.realtime_presence_viewer(uuid) from authenticated; set local role authenticated; select count(*) from realtime.messages; rollback;";
  execFileSync("docker", ["exec", "supabase_db_Penpal", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", sql], { stdio: "pipe" });
});

function hasDocker() {
  try {
    execFileSync("docker", ["inspect", "supabase_db_Penpal"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
