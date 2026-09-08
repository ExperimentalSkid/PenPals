import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20260905420000_interest_explorer_badge.sql", root), "utf8");
const badgeComponent = await readFile(new URL("src/lib/profile-badges.ts", root), "utf8");
const hasLocalDatabase = (() => {
  try { execFileSync("docker", ["inspect", "supabase_db_Penpal"], { stdio: "ignore" }); return true; } catch { return false; }
})();

test("Interest Explorer thresholds are centralized and system-derived", () => {
  assert.match(migration, /add column if not exists minimum_profile_interests integer/);
  assert.match(migration, /minimum_profile_interests is null or minimum_profile_interests > 0/);
  assert.match(migration, /'interest-explorer-bronze'[^\n]*true, 95, 5/);
  assert.match(migration, /'interest-explorer-silver'[^\n]*true, 96, 10/);
  assert.match(migration, /'interest-explorer-gold'[^\n]*true, 97, 20/);
  assert.match(migration, /'interest-explorer-platinum'[^\n]*true, 98, 30/);
  assert.match(migration, /interest_explorer_interest_count/);
  assert.match(migration, /interest_explorer_grade_for_count/);
  assert.match(migration, /interest_explorer_grade\(target_user uuid\)/);
  assert.match(migration, /create or replace function public\.get_profile_badges/);
  assert.match(migration, /create or replace function public\.admin_get_profile_badges/);
});

test("Interest Explorer counts distinct current interest IDs", () => {
  const countStart = migration.indexOf("create or replace function public.interest_explorer_interest_count");
  const countEnd = migration.indexOf("revoke all on function public.interest_explorer_interest_count", countStart);
  assert.notEqual(countStart, -1);
  assert.notEqual(countEnd, -1);
  const body = migration.slice(countStart, countEnd);
  assert.match(body, /count\(distinct pi\.interest_id\)/);
  assert.match(body, /from public\.profile_interests pi/);
  assert.match(body, /pi\.profile_id = target_user/);
});

test("all Interest Explorer grades use the shared profile badge component", () => {
  for (const grade of ["bronze", "silver", "gold", "platinum"]) {
    assert.match(badgeComponent, new RegExp(`interest-explorer-${grade}`));
    assert.match(badgeComponent, new RegExp(`Interest Explorer · ${grade[0].toUpperCase()}${grade.slice(1)}`));
  }
  assert.match(badgeComponent, /icon: "globe", tone: "language-exchange"/);
});

test("Interest Explorer boundaries return only the highest grade and ignore duplicate inserts", { skip: !hasLocalDatabase }, () => {
  const sql = `
select 'below_bronze|' || coalesce(public.interest_explorer_grade_for_count(4), 'none');
select 'exactly_bronze|' || coalesce(public.interest_explorer_grade_for_count(5), 'none');
select 'below_silver|' || coalesce(public.interest_explorer_grade_for_count(9), 'none');
select 'exactly_silver|' || coalesce(public.interest_explorer_grade_for_count(10), 'none');
select 'below_gold|' || coalesce(public.interest_explorer_grade_for_count(19), 'none');
select 'exactly_gold|' || coalesce(public.interest_explorer_grade_for_count(20), 'none');
select 'below_platinum|' || coalesce(public.interest_explorer_grade_for_count(29), 'none');
select 'exactly_platinum|' || coalesce(public.interest_explorer_grade_for_count(30), 'none');
begin;
create temp table interest_explorer_badge_target (id uuid) on commit drop;
create temp table interest_explorer_badge_interests (interest_id bigint, ordinal integer) on commit drop;
insert into interest_explorer_badge_target (id)
select p.id
  from public.profiles p
 where p.deactivated_at is null
   and p.inactive_mode = false
 order by p.id
 limit 1;
delete from public.profile_interests
 where profile_id = (select id from interest_explorer_badge_target);
insert into interest_explorer_badge_interests (interest_id, ordinal)
select i.id, row_number() over (order by i.id)::integer
  from public.interests i
 order by i.id
 limit 30;
insert into public.profile_interests (profile_id, interest_id)
select t.id, i.interest_id
  from interest_explorer_badge_target t
  join interest_explorer_badge_interests i on i.ordinal <= 4;
select 'profile_four|' || (select public.interest_explorer_interest_count(id)::text from interest_explorer_badge_target);
insert into public.profile_interests (profile_id, interest_id)
select t.id, i.interest_id
  from interest_explorer_badge_target t
  join interest_explorer_badge_interests i on i.ordinal between 5 and 5;
select 'profile_five|' || (select public.interest_explorer_interest_count(id)::text from interest_explorer_badge_target);
insert into public.profile_interests (profile_id, interest_id)
select t.id, i.interest_id
  from interest_explorer_badge_target t
  join interest_explorer_badge_interests i on i.ordinal between 6 and 9;
select 'profile_nine|' || (select public.interest_explorer_interest_count(id)::text from interest_explorer_badge_target);
insert into public.profile_interests (profile_id, interest_id)
select t.id, i.interest_id
  from interest_explorer_badge_target t
  join interest_explorer_badge_interests i on i.ordinal between 10 and 10;
select 'profile_ten|' || (select public.interest_explorer_interest_count(id)::text from interest_explorer_badge_target);
insert into public.profile_interests (profile_id, interest_id)
select t.id, i.interest_id
  from interest_explorer_badge_target t
  join interest_explorer_badge_interests i on i.ordinal between 11 and 19;
select 'profile_nineteen|' || (select public.interest_explorer_interest_count(id)::text from interest_explorer_badge_target);
insert into public.profile_interests (profile_id, interest_id)
select t.id, i.interest_id
  from interest_explorer_badge_target t
  join interest_explorer_badge_interests i on i.ordinal between 20 and 20;
select 'profile_twenty|' || (select public.interest_explorer_interest_count(id)::text from interest_explorer_badge_target);
insert into public.profile_interests (profile_id, interest_id)
select t.id, i.interest_id
  from interest_explorer_badge_target t
  join interest_explorer_badge_interests i on i.ordinal between 21 and 29;
select 'profile_twentynine|' || (select public.interest_explorer_interest_count(id)::text from interest_explorer_badge_target);
insert into public.profile_interests (profile_id, interest_id)
select t.id, i.interest_id
  from interest_explorer_badge_target t
  join interest_explorer_badge_interests i on i.ordinal between 30 and 30;
insert into public.profile_interests (profile_id, interest_id)
select t.id, i.interest_id
  from interest_explorer_badge_target t
  join interest_explorer_badge_interests i on i.ordinal <= 30
on conflict (profile_id, interest_id) do nothing;
select 'profile_thirty_after_duplicates|' || (select public.interest_explorer_interest_count(id)::text from interest_explorer_badge_target);
do $$
begin
  perform set_config('request.jwt.claim.sub', (select id::text from interest_explorer_badge_target), false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
end;
$$;
select 'interest_grade|' || coalesce((select public.interest_explorer_grade(id) from interest_explorer_badge_target), 'none');
select 'projected_grade_count|' || (
  select count(*)::text
    from public.get_profile_badges((select id from interest_explorer_badge_target)) badges
   where badges.badge_key like 'interest-explorer-%'
);
rollback;`;
  const output = execFileSync("docker", ["exec", "-i", "supabase_db_Penpal", "psql", "-q", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" }).trim().split(/\r?\n/);
  assert.deepEqual(output, [
    "below_bronze|none",
    "exactly_bronze|interest-explorer-bronze",
    "below_silver|interest-explorer-bronze",
    "exactly_silver|interest-explorer-silver",
    "below_gold|interest-explorer-silver",
    "exactly_gold|interest-explorer-gold",
    "below_platinum|interest-explorer-gold",
    "exactly_platinum|interest-explorer-platinum",
    "profile_four|4",
    "profile_five|5",
    "profile_nine|9",
    "profile_ten|10",
    "profile_nineteen|19",
    "profile_twenty|20",
    "profile_twentynine|29",
    "profile_thirty_after_duplicates|30",
    "interest_grade|interest-explorer-platinum",
    "projected_grade_count|1",
  ]);
});
