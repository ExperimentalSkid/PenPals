import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20260905250000_active_penpal_badge.sql", root), "utf8");
const badgeComponent = await readFile(new URL("src/lib/profile-badges.ts", root), "utf8");
const hasLocalDatabase = (() => {
  try { execFileSync("docker", ["inspect", "supabase_db_Penpal"], { stdio: "ignore" }); return true; } catch { return false; }
})();

test("Active Penpal thresholds are centralized and system-derived", () => {
  assert.match(migration, /add column if not exists minimum_active_days integer/);
  assert.match(migration, /minimum_active_days is null or minimum_active_days > 0/);
  assert.match(migration, /'active-penpal-bronze'[^\n]*true, 23, 30/);
  assert.match(migration, /'active-penpal-silver'[^\n]*true, 24, 90/);
  assert.match(migration, /'active-penpal-gold'[^\n]*true, 25, 365/);
  assert.match(migration, /'active-penpal-platinum'[^\n]*true, 26, 730/);
  assert.match(migration, /active_penpal_day_count/);
  assert.match(migration, /count\(distinct e\.occurred_at::date\)/);
  assert.match(migration, /active_penpal_grade_for_count/);
  assert.match(migration, /active_penpal_grade\(target_user uuid\)/);
  assert.match(migration, /create or replace function public\.get_profile_badges/);
  assert.match(migration, /create or replace function public\.admin_get_profile_badges/);
  assert.match(migration, /public\.active_penpal_grade\(target_user\)/);
});

test("the active-day metric does not use account age", () => {
  const countStart = migration.indexOf("create or replace function public.active_penpal_day_count");
  const countEnd = migration.indexOf("revoke all on function public.active_penpal_day_count", countStart);
  assert.notEqual(countStart, -1);
  assert.notEqual(countEnd, -1);
  assert.doesNotMatch(migration.slice(countStart, countEnd), /auth\.users|created_at/i);
});

test("all Active Penpal grades use the shared badge component", () => {
  for (const grade of ["bronze", "silver", "gold", "platinum"]) {
    assert.match(badgeComponent, new RegExp(`active-penpal-${grade}`));
    assert.match(badgeComponent, new RegExp(`Active Penpal · ${grade[0].toUpperCase()}${grade.slice(1)}`));
  }
  assert.match(badgeComponent, /"active-penpal"/);
});

test("Active Penpal boundaries return only the highest qualifying grade", { skip: !hasLocalDatabase }, () => {
  const sql = `
select 'below_bronze|' || coalesce(public.active_penpal_grade_for_count(29), 'none');
select 'exactly_bronze|' || coalesce(public.active_penpal_grade_for_count(30), 'none');
select 'below_silver|' || coalesce(public.active_penpal_grade_for_count(89), 'none');
select 'exactly_silver|' || coalesce(public.active_penpal_grade_for_count(90), 'none');
select 'below_gold|' || coalesce(public.active_penpal_grade_for_count(364), 'none');
select 'exactly_gold|' || coalesce(public.active_penpal_grade_for_count(365), 'none');
select 'below_platinum|' || coalesce(public.active_penpal_grade_for_count(729), 'none');
select 'exactly_platinum|' || coalesce(public.active_penpal_grade_for_count(730), 'none');
select 'no_activity_account_age|' || coalesce((
  select public.active_penpal_grade(p.id)
    from public.profiles p
   where not exists (
     select 1 from public.activity_rank_events e
      where e.user_id = p.id and e.event_type = 'active_day'
   )
   order by p.created_at, p.id
   limit 1
), 'none');
begin;
create temp table active_badge_target (id uuid) on commit drop;
insert into active_badge_target (id)
select p.id
  from public.profiles p
 where not exists (
   select 1 from public.activity_rank_events e
    where e.user_id = p.id and e.event_type = 'active_day'
 )
 order by p.id
 limit 1;
insert into public.activity_rank_events (user_id, event_key, event_type, occurred_at)
select t.id, 'active-badge-test-' || g::text, 'active_day', (date '2020-01-01' + g)::timestamptz
  from active_badge_target t
 cross join generate_series(0, 29) as series(g);
select 'actual_30|' || (
  select public.active_penpal_day_count(id)::text from active_badge_target
);
with configured as (
  select id,
         set_config('request.jwt.claim.sub', id::text, false),
         set_config('request.jwt.claim.role', 'authenticated', false)
    from active_badge_target
)
select 'projected_30|' || (
  select count(*)::text
    from configured c
    cross join lateral public.get_profile_badges(c.id) badges
   where badges.badge_key like 'active-penpal-%'
);
rollback;`;
  const output = execFileSync("docker", ["exec", "-i", "supabase_db_Penpal", "psql", "-q", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" }).trim().split(/\r?\n/);
  assert.deepEqual(output, [
    "below_bronze|none",
    "exactly_bronze|active-penpal-bronze",
    "below_silver|active-penpal-bronze",
    "exactly_silver|active-penpal-silver",
    "below_gold|active-penpal-silver",
    "exactly_gold|active-penpal-gold",
    "below_platinum|active-penpal-gold",
    "exactly_platinum|active-penpal-platinum",
    "no_activity_account_age|none",
    "actual_30|30",
    "projected_30|1",
  ]);
});
