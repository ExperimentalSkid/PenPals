import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [migration, seed, actions, page] = await Promise.all([
  read("supabase/migrations/20260904232600_support_login_identifiers.sql"),
  read("supabase/seed.sql"),
  read("src/app/auth/actions.ts"),
  read("src/app/sign-in/page.tsx"),
]);

test("sign-in accepts username and keeps legacy email form submissions compatible", () => {
  assert.match(actions, /formData\.get\("identifier"\) \?\? formData\.get\("email"\)/);
  assert.match(actions, /resolve_login_identifier/);
  assert.match(actions, /auth\.signInWithPassword\(\{ email: canonicalEmail, password \}\)/);
  assert.match(page, /auth\.signIn\.identifier/);
  assert.match(page, /name="identifier"/);
  assert.match(page, /autoComplete="username"/);
});

test("identifier resolver is private and password-gated while the seeded admin uses public fixture credentials", () => {
  assert.match(migration, /create table if not exists public\.auth_login_aliases/);
  assert.match(migration, /alter table public\.auth_login_aliases enable row level security/);
  assert.match(migration, /revoke all on table public\.auth_login_aliases from public, anon, authenticated/);
  assert.match(seed, /'admin@example\.com'/);
  assert.match(seed, /values \(u, 'admin', 'Local Admin'/);
  assert.doesNotMatch(`${migration}\n${seed}`, /protonmail|private owner email/i);
  assert.match(migration, /create or replace function public\.resolve_login_identifier\(p_identifier text, p_password text\)/);
  assert.match(migration, /security definer/);
  assert.match(migration, /extensions\.crypt\(coalesce\(p_password, ''\), encrypted_password\) = encrypted_password/);
  assert.match(migration, /grant execute on function public\.resolve_login_identifier\(text, text\) to anon, authenticated/);
});
