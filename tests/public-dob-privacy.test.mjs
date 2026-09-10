import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { LOCAL_DB_CONTAINER } from "./helpers/local-db.mjs";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20260903060000_remove_public_dob_exposure.sql", root), "utf8");
const discoverPage = await readFile(new URL("src/app/app/discover/page.tsx", root), "utf8");
const discoverResults = await readFile(new URL("src/app/app/discover/DiscoverResults.tsx", root), "utf8");
const profilePage = await readFile(new URL("src/app/app/profile/[username]/page.tsx", root), "utf8");
const introductionsPage = await readFile(new URL("src/app/app/introductions/page.tsx", root), "utf8");
const messagesPage = await readFile(new URL("src/app/app/messages/page.tsx", root), "utf8");
const conversationPage = await readFile(new URL("src/app/app/messages/[id]/page.tsx", root), "utf8");
const setupPage = await readFile(new URL("src/app/app/profile/setup/page.tsx", root), "utf8");
const adminDetailPage = await readFile(new URL("src/app/app/admin/users/[id]/page.tsx", root), "utf8");

test("public projections replace exact DOB with a derived age", () => {
  const publicProfileStart = migration.indexOf("create or replace function public.get_public_profile");
  const discoverStart = migration.indexOf("drop function if exists public.get_discover_profiles");
  const resolverStart = migration.indexOf("-- Identity resolution");
  const publicProfile = migration.slice(publicProfileStart, discoverStart);
  const discover = migration.slice(discoverStart, resolverStart);
  const resolver = migration.slice(resolverStart);
  const publicReturn = publicProfile.slice(publicProfile.indexOf("return jsonb_build_object"));

  assert.match(publicReturn, /'age'\s*,\s*case[\s\S]*extract\(year from age\(current_date,p\.birth_date\)\)::integer/);
  assert.doesNotMatch(publicReturn, /'birth_date'/);
  assert.match(discover, /returns table[\s\S]*age integer/);
  assert.doesNotMatch(discover, /birth_date date/);
  assert.match(discover, /extract\(year from age\(current_date,p\.birth_date\)\)::integer/);
  assert.match(resolver, /returns table[\s\S]*age integer/);
  assert.doesNotMatch(resolver, /birth_date date/);
  assert.match(resolver, /extract\(year from age\(current_date,p\.birth_date\)\)::integer/);
});

test("ordinary frontend consumers use server-derived age, never another user's DOB", () => {
  for (const source of [discoverPage, discoverResults, profilePage, introductionsPage, messagesPage, conversationPage]) {
    assert.doesNotMatch(source, /birth_date/);
  }
  assert.match(discoverPage, /profile\.age/);
  assert.match(discoverResults, /profile\.age/);
  assert.match(profilePage, /profile\.age/);
  assert.match(introductionsPage, /person\?\.age/);
  assert.match(messagesPage, /r\.other\.age/);
  assert.match(conversationPage, /otherProfile\?\.age/);
});

test("self setup and admin detail retain the separately authorized DOB paths", () => {
  assert.match(setupPage, /select\("username,display_name,birth_date/);
  assert.match(adminDetailPage, /profile\.birth_date/);
});

test("public DOB removal migration keeps the authenticated-only function boundary", () => {
  for (const signature of ["get_public_profile(text)", "get_discover_profiles(uuid)", "resolve_profile_identity(uuid)"]) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${signature.replace(/[()]/g, "\\$&")}`));
  }
  assert.match(migration, /grant execute on function public\.get_public_profile\(text\) to authenticated/);
  assert.match(migration, /grant execute on function public\.get_discover_profiles\(uuid\) to authenticated/);
  assert.match(migration, /grant execute on function public\.resolve_profile_identity\(uuid\) to authenticated/);
  assert.match(migration, /set search_path = pg_catalog, public/);
});

test("live authenticated projections omit exact DOB and expose derived age", () => {
  let viewerId;
  let adminId;
  try {
    viewerId = execFileSync("docker", ["exec", LOCAL_DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-Atc", "select id from auth.users where email = 'mika@example.local' limit 1"], { encoding: "utf8" }).trim();
    adminId = execFileSync("docker", ["exec", LOCAL_DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-Atc", "select id from auth.users where email = 'admin@example.com' limit 1"], { encoding: "utf8" }).trim();
  } catch {
    return;
  }
  if (!viewerId || !adminId) return;

  const sql = `
begin;
select set_config('request.jwt.claim.sub','${viewerId}',true);
select set_config('request.jwt.claim.role','authenticated',true);
do $$
declare
  public_row jsonb;
  identity_age integer;
  expected_age integer;
  sofia_id uuid;
  sofia_birth date;
  discover_row jsonb;
  discover_result text;
  resolver_result text;
begin
  select id, birth_date into sofia_id, sofia_birth from public.profiles where username = 'sofia';
  select public.get_public_profile('sofia') into public_row;
  if public_row ? 'birth_date' then
    raise exception 'public profile returned exact birth_date';
  end if;
  if not (public_row ? 'age') then
    raise exception 'public profile omitted derived age';
  end if;
  expected_age := extract(year from age(current_date, sofia_birth))::integer;
  if (public_row->>'age')::integer <> expected_age then
    raise exception 'public profile age is not derived from current DOB';
  end if;

  select age into identity_age from public.resolve_profile_identity(sofia_id);
  if identity_age <> expected_age then
    raise exception 'identity resolver age is not derived correctly';
  end if;
  perform set_config('request.jwt.claim.sub','${adminId}',true);
  select to_jsonb(d) into discover_row from public.get_discover_profiles() d where d.username = 'mika';
  if discover_row is null or discover_row ? 'birth_date' then
    raise exception 'discover profile returned exact birth_date';
  end if;
  if not (discover_row ? 'age') then
    raise exception 'discover profile omitted derived age';
  end if;
  select pg_get_function_result('public.get_discover_profiles(uuid)'::regprocedure) into discover_result;
  select pg_get_function_result('public.resolve_profile_identity(uuid)'::regprocedure) into resolver_result;
  if discover_result like '%birth_date%' or discover_result not like '%age integer%' then
    raise exception 'discover return type exposes an exact DOB';
  end if;
  if resolver_result like '%birth_date%' or resolver_result not like '%age integer%' then
    raise exception 'identity return type exposes an exact DOB';
  end if;
  if not has_function_privilege('authenticated', 'public.get_public_profile(text)', 'execute') then
    raise exception 'authenticated lost public profile access';
  end if;
  if has_function_privilege('anon', 'public.get_public_profile(text)', 'execute') then
    raise exception 'anon can execute public profile function';
  end if;
  if not exists (select 1 from public.profiles where id = '${adminId}' and birth_date is not null) then
    raise exception 'self/admin DOB storage path is missing';
  end if;
end
$$;
rollback;`;
  execFileSync("docker", ["exec", "-i", LOCAL_DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atc", sql], { encoding: "utf8" });
});
