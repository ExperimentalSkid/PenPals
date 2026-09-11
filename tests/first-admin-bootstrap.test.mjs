import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  OwnerBootstrapError,
  assertOwnerReady,
  createOrFindOwner,
  promoteFirstOwner,
  readOwnerSetupConfig,
} from "../scripts/first-admin-bootstrap.mjs";

const validEnvironment = {
  NEXT_PUBLIC_SITE_URL: "https://pen-pals.example",
  NEXT_PUBLIC_SUPABASE_URL: "https://api.pen-pals.example",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_key",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test_key",
  CONTACT_CORRELATION_HMAC_SECRET: "test-contact-correlation-secret-32-bytes-minimum",
  PENPALS_DATABASE_URL: "postgresql://owner:password@private-db.example:5432/postgres?sslmode=require",
};

function result(rows = [], rowCount = rows.length) {
  return { rows, rowCount };
}

function scriptedDatabase(steps) {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      calls.push({ sql, params });
      const step = steps.shift();
      assert.ok(step, `Unexpected query: ${sql}`);
      if (step.match) assert.match(sql, step.match);
      if (step.params) assert.deepEqual(params, step.params);
      if (step.error) throw step.error;
      return step.result ?? result();
    },
    assertConsumed() {
      assert.equal(steps.length, 0, "Every expected query was consumed");
    },
  };
}

const readyOwner = {
  id: "00000000-0000-4000-8000-000000000001",
  email_confirmed_at: "2026-09-08T00:00:00.000Z",
  deactivated_at: null,
  entry_complete: true,
  adult: true,
};

test("owner setup configuration accepts a private PostgreSQL URL and rejects unsafe values without echoing them", () => {
  const config = readOwnerSetupConfig(validEnvironment);
  assert.equal(config.databaseUrl, validEnvironment.PENPALS_DATABASE_URL);

  for (const databaseUrl of ["", "mysql://private-db.example/app", "postgresql://private-db.example/app#fragment", " postgresql://private-db.example/app", "postgresql://private-db.example/app\n"]) {
    assert.throws(
      () => readOwnerSetupConfig({ ...validEnvironment, PENPALS_DATABASE_URL: databaseUrl }),
      (error) => {
        assert.ok(error instanceof OwnerBootstrapError);
        if (databaseUrl.trim()) assert.ok(!error.message.includes(databaseUrl.trim()));
        return true;
      },
    );
  }
});

test("existing accounts are never changed and a new owner is created through Supabase Auth only after the no-admin preflight", async () => {
  const existingDb = scriptedDatabase([
    { match: /from public\.profiles where role = 'admin'/, result: result([{ has_administrator: false }]) },
    { match: /from auth\.users/, params: ["owner@example.com"], result: result([{ id: "existing-owner" }]) },
  ]);
  let createCalls = 0;
  const existing = await createOrFindOwner({
    db: existingDb,
    authAdmin: { createUser: async () => { createCalls += 1; return { data: null, error: null }; } },
    email: "Owner@Example.com",
  });
  assert.equal(existing.created, false);
  assert.equal(createCalls, 0);
  existingDb.assertConsumed();

  const newDb = scriptedDatabase([
    { match: /from public\.profiles where role = 'admin'/, result: result([{ has_administrator: false }]) },
    { match: /from auth\.users/, params: ["owner@example.com"], result: result() },
  ]);
  let request;
  const created = await createOrFindOwner({
    db: newDb,
    authAdmin: { createUser: async (input) => { request = input; return { data: { user: { id: "new-owner" } }, error: null }; } },
    email: "Owner@Example.com",
    password: "safe-password",
  });
  assert.equal(created.created, true);
  assert.deepEqual(request, { email: "owner@example.com", password: "safe-password", email_confirm: true });
  newDb.assertConsumed();
});

test("an existing administrator prevents owner-account creation before any Auth mutation", async () => {
  const db = scriptedDatabase([
    { match: /from public\.profiles where role = 'admin'/, result: result([{ has_administrator: true }]) },
  ]);
  let createCalls = 0;
  await assert.rejects(
    () => createOrFindOwner({
      db,
      authAdmin: { createUser: async () => { createCalls += 1; return { data: { user: {} }, error: null }; } },
      email: "owner@example.com",
      password: "safe-password",
    }),
    /administrator profile already exists/i,
  );
  assert.equal(createCalls, 0);
  db.assertConsumed();
});

test("owner readiness requires the existing confirmation, active-profile, adult, and onboarding predicates", () => {
  for (const [state, message] of [
    [null, /No profile exists/i],
    [{ ...readyOwner, email_confirmed_at: null }, /not confirmed/i],
    [{ ...readyOwner, deactivated_at: "2026-09-08T00:00:00.000Z" }, /deactivated/i],
    [{ ...readyOwner, adult: false }, /age requirement/i],
    [{ ...readyOwner, entry_complete: false }, /required profile onboarding/i],
  ]) {
    assert.throws(() => assertOwnerReady(state), message);
  }
  assert.doesNotThrow(() => assertOwnerReady(readyOwner));
});

test("first-owner promotion locks, rechecks, and commits exactly one safe role update", async () => {
  const db = scriptedDatabase([
    { match: /^BEGIN$/ },
    { match: /pg_advisory_xact_lock\(hashtextextended\('penpal-admin-role-change', 0\)\)/ },
    { match: /from public\.profiles where role = 'admin'/, result: result([{ has_administrator: false }]) },
    { match: /join public\.profiles p/, params: ["owner@example.com"], result: result([readyOwner]) },
    { match: /set_config\('app\.allow_role_change', '1', true\)/ },
    { match: /update public\.profiles set role = 'admin' where id = \$1 and role <> 'admin'/, params: [readyOwner.id], result: result([], 1) },
    { match: /^COMMIT$/ },
  ]);
  await promoteFirstOwner(db, "owner@example.com");
  assert.equal(db.calls.some(({ sql }) => sql === "ROLLBACK"), false);
  db.assertConsumed();
});

test("promotion rolls back without an update when onboarding is incomplete or an admin appears after preflight", async () => {
  const incompleteDb = scriptedDatabase([
    { match: /^BEGIN$/ },
    { match: /pg_advisory_xact_lock/ },
    { match: /from public\.profiles where role = 'admin'/, result: result([{ has_administrator: false }]) },
    { match: /join public\.profiles p/, result: result([{ ...readyOwner, entry_complete: false }]) },
    { match: /^ROLLBACK$/ },
  ]);
  await assert.rejects(() => promoteFirstOwner(incompleteDb, "owner@example.com"), /required profile onboarding/i);
  assert.equal(incompleteDb.calls.some(({ sql }) => /^update public\.profiles/i.test(sql)), false);
  incompleteDb.assertConsumed();

  const raceDb = scriptedDatabase([
    { match: /^BEGIN$/ },
    { match: /pg_advisory_xact_lock/ },
    { match: /from public\.profiles where role = 'admin'/, result: result([{ has_administrator: true }]) },
    { match: /^ROLLBACK$/ },
  ]);
  await assert.rejects(() => promoteFirstOwner(raceDb, "owner@example.com"), /administrator profile already exists/i);
  assert.equal(raceDb.calls.some(({ sql }) => /from auth\.users/.test(sql)), false);
  raceDb.assertConsumed();
});

test("the explicit terminal-only owner setup command keeps secrets out of environment arguments and output", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const cliSource = await readFile(new URL("../scripts/setup-first-admin.mjs", import.meta.url), "utf8");
  const coreSource = await readFile(new URL("../scripts/first-admin-bootstrap.mjs", import.meta.url), "utf8");
  assert.equal(packageJson.scripts["setup:owner"], "node scripts/setup-first-admin.mjs");
  assert.match(cliSource, /must run from an interactive terminal/i);
  assert.match(cliSource, /Owner password \(hidden\)/);
  assert.match(coreSource, /email_confirm: true/);
  assert.match(coreSource, /profile_entry_complete\(p\.id\)/);
  assert.match(coreSource, /is_adult_birth_date\(p\.birth_date\)/);
  assert.match(coreSource, /for update of p/);
  assert.match(coreSource, /pg_advisory_xact_lock\(hashtextextended\('penpal-admin-role-change', 0\)\)/);
  assert.doesNotMatch(coreSource, /authAdmin\.updateUser/);
  assert.doesNotMatch(cliSource, /process\.env\.[A-Z_]*PASSWORD/);
  assert.doesNotMatch(cliSource, /console\.(?:log|error)\([^\n]*password/i);

  const cliPath = fileURLToPath(new URL("../scripts/setup-first-admin.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [cliPath], { encoding: "utf8", env: { ...process.env, ...validEnvironment } });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must run from an interactive terminal/i);
  assert.ok(!`${result.stdout}\n${result.stderr}`.includes(validEnvironment.PENPALS_DATABASE_URL));
  assert.ok(!`${result.stdout}\n${result.stderr}`.includes(validEnvironment.SUPABASE_SERVICE_ROLE_KEY));
});
