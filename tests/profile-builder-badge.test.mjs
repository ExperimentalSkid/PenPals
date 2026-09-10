import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { LOCAL_DB_CONTAINER } from "./helpers/local-db.mjs";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20260905240000_profile_builder_badge.sql", root), "utf8");
const completion = await readFile(new URL("src/lib/profile-completeness.ts", root), "utf8");
const badgeComponent = await readFile(new URL("src/lib/profile-badges.ts", root), "utf8");
const hasLocalDatabase = (() => {
  try { execFileSync("docker", ["inspect", LOCAL_DB_CONTAINER], { stdio: "ignore" }); return true; } catch { return false; }
})();

test("Profile Builder thresholds and metadata stay centralized", () => {
  assert.match(migration, /add column if not exists minimum_completion_percent smallint/);
  assert.match(migration, /add column if not exists requires_profile_entry boolean not null default false/);
  assert.match(migration, /minimum_completion_percent between 0 and 100/);
  assert.match(migration, /'profile-builder-bronze'[^\n]*true, 19, 0, true/);
  assert.match(migration, /'profile-builder-silver'[^\n]*true, 20, 75, false/);
  assert.match(migration, /'profile-builder-gold'[^\n]*true, 21, 90, false/);
  assert.match(migration, /'profile-builder-platinum'[^\n]*true, 22, 100, false/);
  assert.match(migration, /profile_entry_complete/);
  assert.match(migration, /profile_completion_percent/);
  assert.match(migration, /profile_builder_grade_for_values/);
  assert.match(migration, /profile_builder_grade\(target_user uuid\)/);
});

test("completion excludes the retired Looking for field", () => {
  const requiredStart = completion.indexOf("const required = [");
  const percentStart = completion.indexOf("const percent =", requiredStart);
  assert.notEqual(requiredStart, -1);
  assert.notEqual(percentStart, -1);
  assert.doesNotMatch(completion.slice(requiredStart, percentStart), /looking_for/i);

  const sqlStart = migration.indexOf("create or replace function public.profile_completion_percent");
  const sqlEnd = migration.indexOf("revoke all on function public.profile_completion_percent", sqlStart);
  assert.notEqual(sqlStart, -1);
  assert.notEqual(sqlEnd, -1);
  assert.doesNotMatch(migration.slice(sqlStart, sqlEnd), /looking_for/i);
});

test("all Profile Builder grades use the shared badge component", () => {
  for (const grade of ["bronze", "silver", "gold", "platinum"]) {
    assert.match(badgeComponent, new RegExp(`profile-builder-${grade}`));
    assert.match(badgeComponent, new RegExp(`Profile Builder · ${grade[0].toUpperCase()}${grade.slice(1)}`));
  }
  assert.match(badgeComponent, /"profile-builder"/);
});

test("Profile Builder boundaries return only the highest qualifying grade", { skip: !hasLocalDatabase }, () => {
  const sql = `
select 'below_minimum|' || coalesce(public.profile_builder_grade_for_values(false, 60), 'none');
select 'minimum_only|' || coalesce(public.profile_builder_grade_for_values(true, 60), 'none');
select 'below_75|' || coalesce(public.profile_builder_grade_for_values(true, 74), 'none');
select 'exactly_75|' || coalesce(public.profile_builder_grade_for_values(true, 75), 'none');
select 'exactly_90|' || coalesce(public.profile_builder_grade_for_values(true, 90), 'none');
select 'exactly_100|' || coalesce(public.profile_builder_grade_for_values(true, 100), 'none');
select 'complete_profile|' || coalesce((
  select public.profile_builder_grade(p.id)
    from public.profiles p
   where public.profile_entry_complete(p.id)
     and public.profile_completion_percent(p.id) = 100
   order by p.id
   limit 1
), 'none');
begin;
with target as (
  select p.id
    from public.profiles p
   where public.profile_entry_complete(p.id)
     and public.profile_completion_percent(p.id) = 100
   order by p.id
   limit 1
)
update public.profiles p
   set looking_for = ''
  from target
 where p.id = target.id;
select 'without_legacy|' || coalesce((
  select public.profile_builder_grade(p.id)
    from public.profiles p
   where public.profile_entry_complete(p.id)
     and public.profile_completion_percent(p.id) = 100
   order by p.id
   limit 1
), 'none');
rollback;
with target as (
  select p.id
    from public.profiles p
   where public.profile_entry_complete(p.id)
     and public.profile_completion_percent(p.id) = 100
   order by p.id
   limit 1
), configured as (
  select t.id,
         set_config('request.jwt.claim.sub', t.id::text, false),
         set_config('request.jwt.claim.role', 'authenticated', false)
    from target t
)
select 'projected_complete|' || (
  select count(*)::text
    from configured c
    cross join lateral public.get_profile_badges(c.id) badges
   where badges.badge_key like 'profile-builder-%'
);`;
  const output = execFileSync("docker", ["exec", "-i", LOCAL_DB_CONTAINER, "psql", "-q", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" }).trim().split(/\r?\n/);
  assert.deepEqual(output, [
    "below_minimum|none",
    "minimum_only|profile-builder-bronze",
    "below_75|profile-builder-bronze",
    "exactly_75|profile-builder-silver",
    "exactly_90|profile-builder-gold",
    "exactly_100|profile-builder-platinum",
    "complete_profile|profile-builder-platinum",
    "without_legacy|profile-builder-platinum",
    "projected_complete|1",
  ]);
});
