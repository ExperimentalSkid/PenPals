import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("../supabase/migrations/20260903100000_fix_pre_account_age_appeal_lifecycle.sql", import.meta.url), "utf8");
const ageMigration = await readFile(new URL("../supabase/migrations/20260902180000_age_gate_and_appeals.sql", import.meta.url), "utf8");
const signIn = await readFile(new URL("../src/app/auth/actions.ts", import.meta.url), "utf8");
const appLayout = await readFile(new URL("../src/app/app/layout.tsx", import.meta.url), "utf8");
const appealPage = await readFile(new URL("../src/app/age-appeal/page.tsx", import.meta.url), "utf8");
const appealAction = await readFile(new URL("../src/app/age-appeal/actions.ts", import.meta.url), "utf8");
const envText = (await readFile(new URL(".env.local", root), "utf8").catch(() => "")).replace(/\\n/g, "\n");

function envValue(name) {
  const line = envText.split(/\r?\n/).find((entry) => entry.startsWith(`${name}=`));
  return process.env[name] || line?.slice(name.length + 1).trim() || "";
}

const supabaseUrl = envValue("NEXT_PUBLIC_SUPABASE_URL");
const publishableKey = envValue("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");

test("the pre-account restriction gate is self-relative and cannot probe email restrictions", () => {
  assert.match(migration, /create or replace function public\.is_current_user_age_restricted\(\)/);
  assert.match(migration, /public\.is_email_verified\(\)/);
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /age_restrictions/);
  assert.match(migration, /blocked_until > current_date/);
  assert.match(migration, /restricted_user_id is null or r\.restricted_user_id = u\.id/);
  assert.match(migration, /set search_path = pg_catalog, public/);
  assert.match(migration, /revoke all on function public\.is_current_user_age_restricted\(\)\s+from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.is_current_user_age_restricted\(\)\s+to authenticated/);
});

test("restricted verified identities remain outside the normal app but retain the authenticated appeal path", () => {
  assert.match(signIn, /supabase\.rpc\("is_current_user_age_restricted"\)/);
  assert.match(signIn, /if \(ageRestrictionError\) redirect\("\/sign-in\?error=Account%20unavailable"\)/);
  assert.match(signIn, /if \(ageRestricted\) redirect\("\/age-appeal"\)/);
  assert.match(appLayout, /db\.rpc\("is_current_user_age_restricted"\)/);
  assert.match(appLayout, /if \(ageRestrictionError\) redirect\("\/sign-in\?error=Account%20unavailable"\)/);
  assert.match(appLayout, /if \(ageRestricted\) redirect\("\/age-appeal"\)/);
  assert.match(appealPage, /authenticated && <form action=\{submitAgeAppeal\}/);
  assert.match(appealPage, /Sign in to the verified account linked to your request/);
  assert.match(appealPage, /without setting up a profile/);
  assert.doesNotMatch(appealPage, /name=\"email\"/);
  assert.match(appealAction, /submit_age_appeal/);
  assert.doesNotMatch(appealAction, /auth\.admin|createUser|signUp/);
});

test("the original gate preserves a verified identity only for appeal and never creates a normal profile", () => {
  assert.match(ageMigration, /if email_verified then/);
  assert.match(ageMigration, /delete from public\.profiles where id = existing_user/);
  assert.match(ageMigration, /Keep the auth identity only so its owner can appeal/);
  assert.match(ageMigration, /return 'restricted'/);
});

test("local runtime: anonymous callers cannot invoke the restriction helper and a normal verified user sees only their own state", { skip: !supabaseUrl || !publishableKey }, async () => {
  const anon = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { error: anonymousError } = await anon.rpc("is_current_user_age_restricted");
  assert.ok(anonymousError, "anonymous caller unexpectedly invoked the protected helper");

  const user = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { error: signInError } = await user.auth.signInWithPassword({ email: "mika@example.local", password: process.env.PENPAL_LOCAL_TEST_PASSWORD || "demo" });
  assert.equal(signInError, null, signInError?.message || "fixture sign-in failed");
  const { data: state, error: stateError } = await user.rpc("is_current_user_age_restricted");
  assert.equal(stateError, null, stateError?.message || "restriction helper failed for authenticated user");
  assert.equal(state, false, "normal fixture unexpectedly appears age-restricted");
  await user.auth.signOut();
});
