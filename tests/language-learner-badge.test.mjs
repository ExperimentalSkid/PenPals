import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20260905410000_language_learner_badge.sql", root), "utf8");
const badgeComponent = await readFile(new URL("src/lib/profile-badges.ts", root), "utf8");
const hasLocalDatabase = (() => {
  try { execFileSync("docker", ["inspect", "supabase_db_Penpal"], { stdio: "ignore" }); return true; } catch { return false; }
})();

test("Language Learner thresholds are centralized and system-derived", () => {
  assert.match(migration, /add column if not exists minimum_learning_languages integer/);
  assert.match(migration, /minimum_learning_languages is null or minimum_learning_languages > 0/);
  assert.match(migration, /'language-learner-bronze'[^\n]*true, 91, 1/);
  assert.match(migration, /'language-learner-silver'[^\n]*true, 92, 2/);
  assert.match(migration, /'language-learner-gold'[^\n]*true, 93, 3/);
  assert.match(migration, /'language-learner-platinum'[^\n]*true, 94, 4/);
  assert.match(migration, /language_learner_language_count/);
  assert.match(migration, /language_learner_grade_for_count/);
  assert.match(migration, /language_learner_grade\(target_user uuid\)/);
  assert.match(migration, /create or replace function public\.get_profile_badges/);
  assert.match(migration, /create or replace function public\.admin_get_profile_badges/);
});

test("Language Learner counts distinct learning language IDs and excludes speaks-only rows", () => {
  const countStart = migration.indexOf("create or replace function public.language_learner_language_count");
  const countEnd = migration.indexOf("revoke all on function public.language_learner_language_count", countStart);
  assert.notEqual(countStart, -1);
  assert.notEqual(countEnd, -1);
  const body = migration.slice(countStart, countEnd);
  assert.match(body, /count\(distinct pl\.language_id\)/);
  assert.match(body, /from public\.profile_languages pl/);
  assert.match(body, /pl\.profile_id = target_user/);
  assert.match(body, /pl\.purpose = 'learning'/);
});

test("all Language Learner grades use the shared profile badge component", () => {
  for (const grade of ["bronze", "silver", "gold", "platinum"]) {
    assert.match(badgeComponent, new RegExp(`language-learner-${grade}`));
    assert.match(badgeComponent, new RegExp(`Language Learner · ${grade[0].toUpperCase()}${grade.slice(1)}`));
  }
  assert.match(badgeComponent, /icon: "globe", tone: "language-exchange"/);
});

test("Language Learner boundaries return only the highest grade and ignore speaks-only rows", { skip: !hasLocalDatabase }, () => {
  const sql = `
select 'zero|' || coalesce(public.language_learner_grade_for_count(0), 'none');
select 'exactly_bronze|' || coalesce(public.language_learner_grade_for_count(1), 'none');
select 'exactly_silver|' || coalesce(public.language_learner_grade_for_count(2), 'none');
select 'exactly_gold|' || coalesce(public.language_learner_grade_for_count(3), 'none');
select 'exactly_platinum|' || coalesce(public.language_learner_grade_for_count(4), 'none');
select 'above_platinum|' || coalesce(public.language_learner_grade_for_count(7), 'none');
begin;
create temp table language_learner_badge_target (id uuid) on commit drop;
create temp table language_learner_badge_languages (language_id bigint, ordinal integer) on commit drop;
insert into language_learner_badge_target (id)
select p.id
  from public.profiles p
 where p.deactivated_at is null
   and p.inactive_mode = false
 order by p.id
 limit 1;
delete from public.profile_languages
 where profile_id = (select id from language_learner_badge_target);
insert into language_learner_badge_languages (language_id, ordinal)
select l.id, row_number() over (order by l.id)::integer
  from public.languages l
 order by l.id
 limit 5;
insert into public.profile_languages (profile_id, language_id, proficiency, purpose)
select t.id, l.language_id, 'intermediate', 'speaks'
  from language_learner_badge_target t
  join language_learner_badge_languages l on l.ordinal = 1;
select 'speaks_only|' || (select public.language_learner_language_count(id)::text from language_learner_badge_target);
insert into public.profile_languages (profile_id, language_id, proficiency, purpose)
select t.id, l.language_id, 'beginner', 'learning'
  from language_learner_badge_target t
  join language_learner_badge_languages l on l.ordinal = 1;
select 'learning_one|' || (select public.language_learner_language_count(id)::text from language_learner_badge_target);
insert into public.profile_languages (profile_id, language_id, proficiency, purpose)
select t.id, l.language_id, 'beginner', 'learning'
  from language_learner_badge_target t
  join language_learner_badge_languages l on l.ordinal = 2;
select 'learning_two|' || (select public.language_learner_language_count(id)::text from language_learner_badge_target);
insert into public.profile_languages (profile_id, language_id, proficiency, purpose)
select t.id, l.language_id, 'beginner', 'learning'
  from language_learner_badge_target t
  join language_learner_badge_languages l on l.ordinal = 3;
select 'learning_three|' || (select public.language_learner_language_count(id)::text from language_learner_badge_target);
insert into public.profile_languages (profile_id, language_id, proficiency, purpose)
select t.id, l.language_id, 'beginner', 'learning'
  from language_learner_badge_target t
  join language_learner_badge_languages l on l.ordinal = 4;
select 'learning_four|' || (select public.language_learner_language_count(id)::text from language_learner_badge_target);
do $$
begin
  perform set_config('request.jwt.claim.sub', (select id::text from language_learner_badge_target), false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
end;
$$;
select 'learning_grade|' || coalesce((select public.language_learner_grade(id) from language_learner_badge_target), 'none');
select 'projected_grade_count|' || (
  select count(*)::text
    from public.get_profile_badges((select id from language_learner_badge_target)) badges
   where badges.badge_key like 'language-learner-%'
);
rollback;`;
  const output = execFileSync("docker", ["exec", "-i", "supabase_db_Penpal", "psql", "-q", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" }).trim().split(/\r?\n/);
  assert.deepEqual(output, [
    "zero|none",
    "exactly_bronze|language-learner-bronze",
    "exactly_silver|language-learner-silver",
    "exactly_gold|language-learner-gold",
    "exactly_platinum|language-learner-platinum",
    "above_platinum|language-learner-platinum",
    "speaks_only|0",
    "learning_one|1",
    "learning_two|2",
    "learning_three|3",
    "learning_four|4",
    "learning_grade|language-learner-platinum",
    "projected_grade_count|1",
  ]);
});
