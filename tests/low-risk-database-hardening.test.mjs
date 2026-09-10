import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { LOCAL_DB_CONTAINER } from "./helpers/local-db.mjs";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20260903142000_harden_low_risk_database_functions.sql", root), "utf8");
const hasLocalDatabase = (() => {
  try {
    execFileSync("docker", ["inspect", LOCAL_DB_CONTAINER], { stdio: "ignore" });
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

test("low-risk hardening preserves authenticated profile reads while denying anonymous trigger RPC access", { skip: !hasLocalDatabase }, () => {
  const sql = String.raw`
begin;
do $$
declare
  viewer uuid := gen_random_uuid();
  target uuid := gen_random_uuid();
  target_username text := 'lowrisk_' || left(replace(gen_random_uuid()::text, '-', ''), 12);
  public_row jsonb;
begin
  insert into auth.users(id,email,email_confirmed_at)
    values (viewer, viewer::text || '@example.test', now()),
           (target, target::text || '@example.test', now());
  insert into public.profiles(id,username,display_name,birth_date,gender,country,country_code,city,location_precision,bio,quote,looking_for)
    values
      (viewer, 'viewer_' || left(viewer::text, 8), 'Low Risk Viewer', date '1990-01-01', 'Not specified', 'NO', 'NO', '', 'country', 'Fixture viewer bio.', 'Fixture quote.', 'friendship'),
      (target, target_username, 'Low Risk Target', date '1990-01-01', 'Not specified', 'SE', 'SE', '', 'country', 'Fixture target bio.', 'Fixture quote.', 'friendship');
  perform set_config('request.jwt.claim.sub', viewer::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  select public.get_public_profile(target_username) into public_row;
  if public_row is null then raise exception 'authenticated public profile read failed'; end if;
  if public_row ? 'role' or public_row ? 'deactivated_at' then raise exception 'private profile fields leaked'; end if;
end;
$$;
reset role;
select
  has_function_privilege('anon', 'public.set_updated_at()', 'execute')::text || '|' ||
  has_function_privilege('authenticated', 'public.set_updated_at()', 'execute')::text || '|' ||
  (pg_get_functiondef('public.get_public_profile(text)'::regprocedure) like '%p0.*%')::text;
rollback;`;
  const output = execFileSync("docker", ["exec", "-i", LOCAL_DB_CONTAINER, "psql", "-q", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" }).trim();
  assert.equal(output, "false|true|false");
});
