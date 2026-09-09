import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = new URL("..", import.meta.url);
const script = new URL("scripts/validate-production-app-config.mjs", root);
const scriptPath = fileURLToPath(script);
const clientSource = await readFile(new URL("src/lib/supabase/client.ts", root), "utf8");
const serverSource = await readFile(new URL("src/lib/supabase/server.ts", root), "utf8");
const workerSource = await readFile(new URL("scripts/run-background-jobs.mjs", root), "utf8");
const bootstrapSql = await readFile(new URL("deploy/bootstrap-first-admin.sql", root), "utf8");

const publishableKey = `sb_publishable_${"p".repeat(30)}`;
const serviceRoleKey = `sb_secret_${"s".repeat(30)}`;
const validEnvironment = {
  NEXT_PUBLIC_SITE_URL: "https://penpals.example",
  NEXT_PUBLIC_SUPABASE_URL: "https://api.penpals.example",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
  SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
};

function run(overrides = {}) {
  return spawnSync(process.execPath, [scriptPath], {
    encoding: "utf8",
    env: { ...process.env, ...validEnvironment, ...overrides },
  });
}

test("production application config accepts separate HTTPS app and Supabase settings", () => {
  const result = run({ GOOGLE_LOGIN_STATE_SECRET: "g".repeat(32), BACKGROUND_JOB_BATCH_SIZE: "100" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /configuration is valid/i);
  assert.ok(!`${result.stdout}\n${result.stderr}`.includes(publishableKey));
  assert.ok(!`${result.stdout}\n${result.stderr}`.includes(serviceRoleKey));
});

test("production application config fails closed for missing core settings", () => {
  for (const key of Object.keys(validEnvironment)) {
    const result = run({ [key]: "" });
    assert.notEqual(result.status, 0, key);
    assert.match(result.stderr, new RegExp(`${key} is required`));
  }
});

test("production application config rejects non-production origins and exposed server secrets", () => {
  const local = run({ NEXT_PUBLIC_SITE_URL: "http://localhost:3000" });
  assert.notEqual(local.status, 0);
  assert.match(local.stderr, /must use HTTPS|must not point to localhost/);

  const path = run({ NEXT_PUBLIC_SUPABASE_URL: "https://api.penpals.example/rest/v1" });
  assert.notEqual(path.status, 0);
  assert.match(path.stderr, /must be an origin/);

  const exposedKey = `sb_secret_${"x".repeat(30)}`;
  const exposed = run({ NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: exposedKey });
  assert.notEqual(exposed.status, 0);
  assert.match(exposed.stderr, /must not expose/);
  assert.ok(!exposed.stderr.includes(exposedKey));
});

test("production application config guards key separation and optional deployment settings", () => {
  const sameKey = run({ SUPABASE_SERVICE_ROLE_KEY: publishableKey });
  assert.notEqual(sameKey.status, 0);
  assert.match(sameKey.stderr, /must be distinct/);

  const shortGoogleSecret = run({ GOOGLE_LOGIN_STATE_SECRET: "too-short" });
  assert.notEqual(shortGoogleSecret.status, 0);
  assert.match(shortGoogleSecret.stderr, /at least 32 characters/);

  const invalidBatch = run({ BACKGROUND_JOB_BATCH_SIZE: "501" });
  assert.notEqual(invalidBatch.status, 0);
  assert.match(invalidBatch.stderr, /integer from 1 to 500/);
});

test("the validator covers the environment used by browser, server, worker, and first-admin bootstrap", () => {
  assert.match(clientSource, /NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(clientSource, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(serverSource, /NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(workerSource, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(bootstrapSql, /\\prompt 'Confirmed owner account email: /);
  assert.match(bootstrapSql, /owner_confirmed_at is null/);
  assert.match(bootstrapSql, /profile_entry_complete\(p\.id\)/);
  assert.match(bootstrapSql, /is_adult_birth_date\(p\.birth_date\)/);
  assert.match(bootstrapSql, /exists \(select 1 from public\.profiles where role = 'admin'\)/);
  assert.match(bootstrapSql, /set_config\('app\.allow_role_change', '1', true\)/);
  assert.doesNotMatch(bootstrapSql, /grant execute|security definer|create function/i);
});
