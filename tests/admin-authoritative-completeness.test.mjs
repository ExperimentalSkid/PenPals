import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { LOCAL_DB_CONTAINER } from "./helpers/local-db.mjs";

const migration = await readFile(new URL("../supabase/migrations/20260905440000_admin_authoritative_profile_completeness.sql", import.meta.url), "utf8");
const hasLocalDatabase = (() => {
  try {
    return execFileSync("docker", ["inspect", "--format", "{{.State.Running}}", LOCAL_DB_CONTAINER], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() === "true";
  } catch { return false; }
})();

test("admin completion delegates to the current profile rule without changing guards, grants, or onboarding", () => {
  assert.equal((migration.match(/public\.profile_completion_percent\((?:p\.id|target_user)\) = 100/g) ?? []).length, 3);
  assert.match(migration, /create or replace function public\.admin_list_users\(/);
  assert.match(migration, /create or replace function public\.admin_list_users_page\(/);
  assert.match(migration, /create or replace function public\.admin_get_user_detail\(/);
  assert.match(migration, /where public\.is_admin\(\)/);
  assert.equal((migration.match(/if not public\.is_admin\(\) then/g) ?? []).length, 2);
  assert.equal((migration.match(/set search_path = pg_catalog, public/g) ?? []).length, 3);
  assert.match(migration, /result := public\.admin_get_user_detail_legacy\(target_user\)/);
  assert.match(migration, /jsonb_set\(result, '\{profile,profile_complete\}'/);
  assert.doesNotMatch(migration, /looking_for|\bgrant\s+execute\b|\brevoke\s+all\b|\bupdate\s+public\.|create or replace function public\.profile_(?:entry_complete|completion_percent)/i);
});

test("admin directory filters, detail, and Profile Builder agree for current complete and incomplete profiles", { skip: !hasLocalDatabase }, () => {
  // Only fresh fixtures and authorized admin reads. No existing member data is
  // changed, and the complete transaction (including trigger effects) rolls back.
  const sql = String.raw`
begin;
do $$
declare
  admin_id uuid;
  complete_id uuid := gen_random_uuid();
  incomplete_id uuid := gen_random_uuid();
  fixture_prefix text := 'ac_' || left(replace(gen_random_uuid()::text, '-', ''), 12);
  region text;
  payload jsonb;
  legacy_payload jsonb;
  n integer;
begin
  select p.id into admin_id
    from public.profiles p join auth.users u on u.id = p.id
   where p.role = 'admin' and p.deactivated_at is null and u.email_confirmed_at is not null
   order by p.id limit 1;
  if admin_id is null then raise exception 'authorized administrator fixture unavailable'; end if;
  insert into auth.users(id, email, email_confirmed_at)
    values (complete_id, complete_id::text || '@example.test', now()),
           (incomplete_id, incomplete_id::text || '@example.test', now());
  insert into public.profiles(id, username, display_name, birth_date, gender, country, country_code, city, location_precision, bio, quote, looking_for, avatar_path, role)
    values (complete_id, fixture_prefix || '_full', 'Completion Full', '1990-01-01', 'Not specified', 'NO', 'NO', '', 'country', 'Books and thoughtful letters.', 'Always curious.', '', 'fixture/avatar.jpg', 'user'),
           (incomplete_id, fixture_prefix || '_part', 'Completion Partial', '1990-01-01', 'Not specified', 'NO', 'NO', '', 'country', 'Books and thoughtful letters.', '', '', 'fixture/avatar.jpg', 'user');
  insert into public.profile_languages(profile_id, language_id, proficiency, purpose)
    select p.id, l.id, 'fluent', 'speaks'
      from (values (complete_id), (incomplete_id)) p(id)
      cross join (select id from public.languages order by id limit 1) l;
  insert into public.profile_interests(profile_id, interest_id)
    select p.id, i.id
      from (values (complete_id), (incomplete_id)) p(id)
      cross join (select id from public.interests order by id limit 3) i;
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  if not public.is_admin() then raise exception 'authorized administrator fixture is not active'; end if;

  if public.profile_completion_percent(complete_id) is distinct from 100
     or public.profile_completion_percent(incomplete_id) is distinct from 90 then
    raise exception 'current-field completion fixture is not valid';
  end if;
  if not public.profile_entry_complete(complete_id) or not public.profile_entry_complete(incomplete_id) then
    raise exception 'optional missing detail incorrectly changed onboarding eligibility';
  end if;

  select count(*) into n from public.admin_list_users(fixture_prefix, 'all', 'user', 'complete') u where u.id = complete_id and u.profile_complete;
  if n <> 1 then raise exception 'compatibility directory excludes complete current profile'; end if;
  select count(*) into n from public.admin_list_users(fixture_prefix, 'all', 'user', 'incomplete') u where u.id = incomplete_id and not u.profile_complete;
  if n <> 1 then raise exception 'compatibility directory incomplete filter disagrees'; end if;
  select count(*) into n from public.admin_list_users_page(fixture_prefix, 'all', 'user', 'complete', 50, 0) u where u.id = complete_id and u.profile_complete and u.total_count = 1;
  if n <> 1 then raise exception 'paged directory complete filter or total disagrees'; end if;
  select count(*) into n from public.admin_list_users_page(fixture_prefix, 'all', 'user', 'incomplete', 50, 0) u where u.id = incomplete_id and not u.profile_complete and u.total_count = 1;
  if n <> 1 then raise exception 'paged directory incomplete filter or total disagrees'; end if;
  select count(*) into n from public.admin_list_users_page(fixture_prefix, 'all', 'user', 'all', 50, 0) u where u.total_count = 2;
  if n <> 2 then raise exception 'all filter no longer returns both fixtures'; end if;

  payload := public.admin_get_user_detail(complete_id);
  legacy_payload := public.admin_get_user_detail_legacy(complete_id);
  if (payload #>> '{profile,profile_complete}')::boolean is distinct from true then
    raise exception 'detail excludes complete profile with blank retired field';
  end if;
  if (payload #- '{profile,profile_complete}') is distinct from (legacy_payload #- '{profile,profile_complete}') then
    raise exception 'detail changed unrelated payload fields';
  end if;
  if (public.admin_get_user_detail(incomplete_id) #>> '{profile,profile_complete}')::boolean is distinct from false then
    raise exception 'detail marks incomplete profile complete';
  end if;
  if public.admin_get_user_detail(gen_random_uuid()) is not null then
    raise exception 'nonexistent profile detail changed its result';
  end if;
  if public.profile_builder_grade(complete_id) is distinct from 'profile-builder-platinum'
     or public.profile_builder_grade(incomplete_id) is distinct from 'profile-builder-gold' then
    raise exception 'completion and Profile Builder grades disagree';
  end if;
  select count(*) into n from public.admin_get_profile_badges(complete_id) b
    where b.badge_key like 'profile-builder-%' and b.badge_key = 'profile-builder-platinum';
  if n <> 1 then raise exception 'staff projection does not return the single Platinum badge'; end if;

  -- Use a valid canonical region: the location-integrity trigger already
  -- prevents saving region precision without a region code. Country needs
  -- neither a region nor a city; locality completion still requires a city.
  select region_code into region from public.location_regions where country_code = 'NO' order by region_code limit 1;
  if region is null then raise exception 'canonical Norway region fixture unavailable'; end if;
  update public.profiles set location_precision = 'region', region_code = region where id = complete_id;
  if (public.admin_get_user_detail(complete_id) #>> '{profile,profile_complete}')::boolean is distinct from true then
    raise exception 'region precision unnecessarily requires a city';
  end if;
  update public.profiles set location_precision = 'locality', city = '' where id = complete_id;
  if (public.admin_get_user_detail(complete_id) #>> '{profile,profile_complete}')::boolean is distinct from false then
    raise exception 'locality without city is complete';
  end if;
  update public.profiles set city = 'Completion fixture locality' where id = complete_id;
  if (public.admin_get_user_detail(complete_id) #>> '{profile,profile_complete}')::boolean is distinct from true then
    raise exception 'complete locality profile is incomplete';
  end if;
end;
$$;
rollback;
`;
  const output = execFileSync("docker", ["exec", "-i", LOCAL_DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" });
  assert.match(output, /ROLLBACK/);
});

test("admin completeness replacement preserves existing execution privileges and search paths", { skip: !hasLocalDatabase }, () => {
  // Read-only ACL metadata inspection, not attempted access under other roles.
  const sql = String.raw`
select p.proname || '|' || p.prosecdef::text || '|' ||
       has_function_privilege('anon', p.oid, 'execute')::text || '|' ||
       has_function_privilege('authenticated', p.oid, 'execute')::text || '|' ||
       has_function_privilege('service_role', p.oid, 'execute')::text || '|' ||
       (p.proconfig @> array['search_path=pg_catalog, public'])::text
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('admin_list_users', 'admin_list_users_page', 'admin_get_user_detail', 'admin_get_user_detail_legacy')
 order by p.proname;
`;
  const output = execFileSync("docker", ["exec", "-i", LOCAL_DB_CONTAINER, "psql", "-q", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" }).trim().split(/\r?\n/);
  assert.deepEqual(output, [
    "admin_get_user_detail|true|false|true|true|true",
    "admin_get_user_detail_legacy|true|false|false|true|true",
    "admin_list_users|true|false|false|true|true",
    "admin_list_users_page|true|false|true|true|true",
  ]);
});
