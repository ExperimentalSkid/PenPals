import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { LOCAL_DB_CONTAINER } from "./helpers/local-db.mjs";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20260905360000_mystery_explorer_badge.sql", root), "utf8");
const badgeComponent = await readFile(new URL("src/lib/profile-badges.ts", root), "utf8");
const hasLocalDatabase = (() => {
  try { execFileSync("docker", ["inspect", LOCAL_DB_CONTAINER], { stdio: "ignore" }); return true; } catch { return false; }
})();

test("Mystery Explorer thresholds are centralized and system-derived", () => {
  assert.match(migration, /add column if not exists minimum_mystery_selections integer/);
  assert.match(migration, /minimum_mystery_selections is null or minimum_mystery_selections > 0/);
  assert.match(migration, /'mystery-explorer-bronze'[^\n]*true, 71, 10/);
  assert.match(migration, /'mystery-explorer-silver'[^\n]*true, 72, 50/);
  assert.match(migration, /'mystery-explorer-gold'[^\n]*true, 73, 200/);
  assert.match(migration, /'mystery-explorer-platinum'[^\n]*true, 74, 500/);
  assert.match(migration, /mystery_explorer_selection_count/);
  assert.match(migration, /mystery_explorer_grade_for_count/);
  assert.match(migration, /mystery_explorer_grade\(target_user uuid\)/);
  assert.match(migration, /create or replace function public\.get_profile_badges/);
  assert.match(migration, /create or replace function public\.admin_get_profile_badges/);
});

test("Mystery Explorer counts selected cards, not exposure rows", () => {
  const countStart = migration.indexOf("create or replace function public.mystery_explorer_selection_count");
  const countEnd = migration.indexOf("revoke all on function public.mystery_explorer_selection_count", countStart);
  assert.notEqual(countStart, -1);
  assert.notEqual(countEnd, -1);
  const body = migration.slice(countStart, countEnd);
  assert.match(body, /count\(distinct c\.id\)/);
  assert.match(body, /from public\.mystery_pick_cards c/);
  assert.match(body, /c\.viewer_id = target_user/);
  assert.match(body, /c\.selected_at is not null/);
  assert.doesNotMatch(body, /exposure_count/);
});

test("all Mystery Explorer grades use the shared profile badge component", () => {
  for (const grade of ["bronze", "silver", "gold", "platinum"]) {
    assert.match(badgeComponent, new RegExp(`mystery-explorer-${grade}`));
    assert.match(badgeComponent, new RegExp(`Mystery Explorer · ${grade[0].toUpperCase()}${grade.slice(1)}`));
  }
  assert.match(badgeComponent, /"mystery-explorer"/);
});

test("Mystery Explorer boundaries return only the highest grade and ignore unselected exposures", { skip: !hasLocalDatabase }, () => {
  const sql = `
select 'below_bronze|' || coalesce(public.mystery_explorer_grade_for_count(9), 'none');
select 'exactly_bronze|' || coalesce(public.mystery_explorer_grade_for_count(10), 'none');
select 'below_silver|' || coalesce(public.mystery_explorer_grade_for_count(49), 'none');
select 'exactly_silver|' || coalesce(public.mystery_explorer_grade_for_count(50), 'none');
select 'below_gold|' || coalesce(public.mystery_explorer_grade_for_count(199), 'none');
select 'exactly_gold|' || coalesce(public.mystery_explorer_grade_for_count(200), 'none');
select 'below_platinum|' || coalesce(public.mystery_explorer_grade_for_count(499), 'none');
select 'exactly_platinum|' || coalesce(public.mystery_explorer_grade_for_count(500), 'none');
begin;
create temp table mystery_explorer_badge_target (id uuid, candidate_id uuid, exposure_candidate_id uuid) on commit drop;
with fixtures as (
  select gen_random_uuid() as viewer_id, gen_random_uuid() as candidate_id, gen_random_uuid() as exposure_candidate_id,
         'me_' || left(replace(gen_random_uuid()::text, '-', ''), 8) as prefix
), auth_insert as (
  insert into auth.users(id, email, email_confirmed_at)
  select viewer_id, viewer_id::text || '@example.test', now() from fixtures
  union all select candidate_id, candidate_id::text || '@example.test', now() from fixtures
  union all select exposure_candidate_id, exposure_candidate_id::text || '@example.test', now() from fixtures
  returning id
), profile_insert as (
  insert into public.profiles(id, username, display_name, birth_date, gender, country, country_code, city, location_precision, bio, quote, looking_for)
  select viewer_id, prefix || '_v', 'Mystery Viewer', date '1990-01-01', 'Not specified', 'NO', 'NO', '', 'country', 'Fixture bio.', 'Fixture quote.', 'friendship' from fixtures
  union all select candidate_id, prefix || '_c', 'Mystery Candidate', date '1990-01-01', 'Not specified', 'SE', 'SE', '', 'country', 'Fixture bio.', 'Fixture quote.', 'friendship' from fixtures
  union all select exposure_candidate_id, prefix || '_e', 'Mystery Exposure', date '1990-01-01', 'Not specified', 'DK', 'DK', '', 'country', 'Fixture bio.', 'Fixture quote.', 'friendship' from fixtures
  returning id
), target_insert as (
  select viewer_id, candidate_id, exposure_candidate_id from fixtures
)
insert into mystery_explorer_badge_target(id, candidate_id, exposure_candidate_id)
select viewer_id, candidate_id, exposure_candidate_id from target_insert;
insert into public.mystery_pick_sessions(viewer_id) select id from mystery_explorer_badge_target;
insert into public.mystery_pick_cards (session_id, viewer_id, candidate_id, position, selected_at)
select s.id, t.id, t.candidate_id, 1, now()
  from public.mystery_pick_sessions s
  join mystery_explorer_badge_target t on t.id = s.viewer_id
 order by s.created_at desc
 limit 1;
with new_sessions as (
  insert into public.mystery_pick_sessions (viewer_id)
  select t.id
    from mystery_explorer_badge_target t
   cross join generate_series(1, 9)
  returning id, viewer_id
)
insert into public.mystery_pick_cards (session_id, viewer_id, candidate_id, position, selected_at)
select s.id, s.viewer_id, t.candidate_id, 1, now()
  from new_sessions s
  join mystery_explorer_badge_target t on t.id = s.viewer_id;
insert into public.mystery_pick_exposures (viewer_id, candidate_id, last_exposed_at, exposure_count)
select id, exposure_candidate_id, now(), 1 from mystery_explorer_badge_target
on conflict (viewer_id, candidate_id) do update
  set last_exposed_at = excluded.last_exposed_at,
      exposure_count = excluded.exposure_count;
select 'selected_count|' || (select public.mystery_explorer_selection_count(id)::text from mystery_explorer_badge_target);
select 'selected_grade|' || coalesce((select public.mystery_explorer_grade(id) from mystery_explorer_badge_target), 'none');
insert into public.mystery_pick_sessions (viewer_id)
select id from mystery_explorer_badge_target;
insert into public.mystery_pick_exposures (viewer_id, candidate_id, last_exposed_at, exposure_count)
select id, exposure_candidate_id, now(), 2 from mystery_explorer_badge_target
on conflict (viewer_id, candidate_id) do update
  set last_exposed_at = excluded.last_exposed_at,
      last_selected_at = excluded.last_selected_at,
      exposure_count = excluded.exposure_count;
select 'exposure_only_unchanged|' || (select public.mystery_explorer_selection_count(id)::text from mystery_explorer_badge_target);
do $$
begin
  perform set_config('request.jwt.claim.sub', (select id::text from mystery_explorer_badge_target), false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
end;
$$;
select 'projected_grade_count|' || (
  select count(*)::text
    from public.get_profile_badges((select id from mystery_explorer_badge_target)) badges
   where badges.badge_key like 'mystery-explorer-%'
);
rollback;`;
  const output = execFileSync("docker", ["exec", "-i", LOCAL_DB_CONTAINER, "psql", "-q", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" }).trim().split(/\r?\n/);
  assert.deepEqual(output, [
    "below_bronze|none",
    "exactly_bronze|mystery-explorer-bronze",
    "below_silver|mystery-explorer-bronze",
    "exactly_silver|mystery-explorer-silver",
    "below_gold|mystery-explorer-silver",
    "exactly_gold|mystery-explorer-gold",
    "below_platinum|mystery-explorer-gold",
    "exactly_platinum|mystery-explorer-platinum",
    "selected_count|10",
    "selected_grade|mystery-explorer-bronze",
    "exposure_only_unchanged|10",
    "projected_grade_count|1",
  ]);
});
