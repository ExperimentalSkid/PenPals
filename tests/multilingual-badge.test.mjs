import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { LOCAL_DB_CONTAINER } from "./helpers/local-db.mjs";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20260905400000_multilingual_badge.sql", root), "utf8");
const badgeComponent = await readFile(new URL("src/lib/profile-badges.ts", root), "utf8");
const hasLocalDatabase = (() => {
  try { execFileSync("docker", ["inspect", LOCAL_DB_CONTAINER], { stdio: "ignore" }); return true; } catch { return false; }
})();

test("Multilingual thresholds are centralized and system-derived", () => {
  assert.match(migration, /add column if not exists minimum_profile_languages integer/);
  assert.match(migration, /minimum_profile_languages is null or minimum_profile_languages > 0/);
  assert.match(migration, /'multilingual-bronze'[^\n]*true, 87, 2/);
  assert.match(migration, /'multilingual-silver'[^\n]*true, 88, 3/);
  assert.match(migration, /'multilingual-gold'[^\n]*true, 89, 4/);
  assert.match(migration, /'multilingual-platinum'[^\n]*true, 90, 5/);
  assert.match(migration, /multilingual_language_count/);
  assert.match(migration, /multilingual_grade_for_count/);
  assert.match(migration, /multilingual_grade\(target_user uuid\)/);
  assert.match(migration, /create or replace function public\.get_profile_badges/);
  assert.match(migration, /create or replace function public\.admin_get_profile_badges/);
});

test("Multilingual counts distinct current language IDs, not purpose rows", () => {
  const countStart = migration.indexOf("create or replace function public.multilingual_language_count");
  const countEnd = migration.indexOf("revoke all on function public.multilingual_language_count", countStart);
  assert.notEqual(countStart, -1);
  assert.notEqual(countEnd, -1);
  const body = migration.slice(countStart, countEnd);
  assert.match(body, /count\(distinct pl\.language_id\)/);
  assert.match(body, /from public\.profile_languages pl/);
  assert.match(body, /pl\.profile_id = target_user/);
  assert.doesNotMatch(body, /purpose\s*=/);
});

test("all Multilingual grades use the shared profile badge component", () => {
  for (const grade of ["bronze", "silver", "gold", "platinum"]) {
    assert.match(badgeComponent, new RegExp(`multilingual-${grade}`));
    assert.match(badgeComponent, new RegExp(`Multilingual · ${grade[0].toUpperCase()}${grade.slice(1)}`));
  }
  assert.match(badgeComponent, /icon: "globe", tone: "language-exchange"/);
});

test("Multilingual boundaries return only the highest grade and ignore duplicate purpose rows", { skip: !hasLocalDatabase }, () => {
  const sql = `
select 'one_language|' || coalesce(public.multilingual_grade_for_count(1), 'none');
select 'exactly_bronze|' || coalesce(public.multilingual_grade_for_count(2), 'none');
select 'exactly_silver|' || coalesce(public.multilingual_grade_for_count(3), 'none');
select 'exactly_gold|' || coalesce(public.multilingual_grade_for_count(4), 'none');
select 'exactly_platinum|' || coalesce(public.multilingual_grade_for_count(5), 'none');
select 'above_platinum|' || coalesce(public.multilingual_grade_for_count(8), 'none');
begin;
create temp table multilingual_badge_target (id uuid) on commit drop;
create temp table multilingual_badge_languages (language_id bigint, ordinal integer) on commit drop;
insert into multilingual_badge_target (id)
select p.id
  from public.profiles p
 where p.deactivated_at is null
   and p.inactive_mode = false
 order by p.id
 limit 1;
delete from public.profile_languages
 where profile_id = (select id from multilingual_badge_target);
insert into multilingual_badge_languages (language_id, ordinal)
select l.id, row_number() over (order by l.id)::integer
  from public.languages l
 order by l.id
 limit 5;
insert into public.profile_languages (profile_id, language_id, proficiency, purpose)
select t.id, l.language_id, 'intermediate', case when l.ordinal = 1 then 'speaks' else 'speaks' end
  from multilingual_badge_target t cross join multilingual_badge_languages l
 where l.ordinal <= 1;
select 'profile_one|' || (select public.multilingual_language_count(id)::text from multilingual_badge_target);
insert into public.profile_languages (profile_id, language_id, proficiency, purpose)
select t.id, l.language_id, 'intermediate', 'speaks'
  from multilingual_badge_target t cross join multilingual_badge_languages l
 where l.ordinal between 2 and 2;
select 'profile_two|' || (select public.multilingual_language_count(id)::text from multilingual_badge_target);
insert into public.profile_languages (profile_id, language_id, proficiency, purpose)
select t.id, l.language_id, 'intermediate', 'speaks'
  from multilingual_badge_target t cross join multilingual_badge_languages l
 where l.ordinal between 3 and 3;
select 'profile_three|' || (select public.multilingual_language_count(id)::text from multilingual_badge_target);
insert into public.profile_languages (profile_id, language_id, proficiency, purpose)
select t.id, l.language_id, 'intermediate', 'speaks'
  from multilingual_badge_target t cross join multilingual_badge_languages l
 where l.ordinal between 4 and 4;
select 'profile_four|' || (select public.multilingual_language_count(id)::text from multilingual_badge_target);
insert into public.profile_languages (profile_id, language_id, proficiency, purpose)
select t.id, l.language_id, 'intermediate', 'speaks'
  from multilingual_badge_target t cross join multilingual_badge_languages l
 where l.ordinal between 5 and 5;
insert into public.profile_languages (profile_id, language_id, proficiency, purpose)
select t.id, l.language_id, 'beginner', 'learning'
  from multilingual_badge_target t
  join multilingual_badge_languages l on l.ordinal = 1;
do $$
begin
  perform set_config('request.jwt.claim.sub', (select id::text from multilingual_badge_target), false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
end;
$$;
select 'language_count|' || (select public.multilingual_language_count(id)::text from multilingual_badge_target);
select 'language_grade|' || coalesce((select public.multilingual_grade(id) from multilingual_badge_target), 'none');
select 'projected_grade_count|' || (
  select count(*)::text
    from public.get_profile_badges((select id from multilingual_badge_target)) badges
   where badges.badge_key like 'multilingual-%'
);
rollback;`;
  const output = execFileSync("docker", ["exec", "-i", LOCAL_DB_CONTAINER, "psql", "-q", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" }).trim().split(/\r?\n/);
  assert.deepEqual(output, [
    "one_language|none",
    "exactly_bronze|multilingual-bronze",
    "exactly_silver|multilingual-silver",
    "exactly_gold|multilingual-gold",
    "exactly_platinum|multilingual-platinum",
    "above_platinum|multilingual-platinum",
    "profile_one|1",
    "profile_two|2",
    "profile_three|3",
    "profile_four|4",
    "language_count|5",
    "language_grade|multilingual-platinum",
    "projected_grade_count|1",
  ]);
});
