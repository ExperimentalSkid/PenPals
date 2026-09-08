import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20260905350000_steady_penpal_badge.sql", root), "utf8");
const badgeComponent = await readFile(new URL("src/lib/profile-badges.ts", root), "utf8");
const hasLocalDatabase = (() => {
  try { execFileSync("docker", ["inspect", "supabase_db_Penpal"], { stdio: "ignore" }); return true; } catch { return false; }
})();

test("Steady Penpal thresholds are centralized and system-derived", () => {
  assert.match(migration, /add column if not exists minimum_active_months integer/);
  assert.match(migration, /minimum_active_months is null or minimum_active_months > 0/);
  assert.match(migration, /'steady-penpal-bronze'[^\n]*true, 67, 3/);
  assert.match(migration, /'steady-penpal-silver'[^\n]*true, 68, 6/);
  assert.match(migration, /'steady-penpal-gold'[^\n]*true, 69, 12/);
  assert.match(migration, /'steady-penpal-platinum'[^\n]*true, 70, 24/);
  assert.match(migration, /steady_penpal_active_month_count/);
  assert.match(migration, /steady_penpal_grade_for_count/);
  assert.match(migration, /steady_penpal_grade\(target_user uuid\)/);
  const monthCountStart = migration.indexOf("create or replace function public.steady_penpal_active_month_count");
  const monthCountEnd = migration.indexOf("revoke all on function public.steady_penpal_active_month_count", monthCountStart);
  assert.doesNotMatch(migration.slice(monthCountStart, monthCountEnd), /auth\.users/);
  assert.match(migration, /create or replace function public\.get_profile_badges/);
  assert.match(migration, /create or replace function public\.admin_get_profile_badges/);
});

test("Steady Penpal groups active_day events by calendar month", () => {
  const countStart = migration.indexOf("create or replace function public.steady_penpal_active_month_count");
  const countEnd = migration.indexOf("revoke all on function public.steady_penpal_active_month_count", countStart);
  assert.notEqual(countStart, -1);
  assert.notEqual(countEnd, -1);
  const body = migration.slice(countStart, countEnd);
  assert.match(body, /count\(distinct date_trunc\('month', e\.occurred_at::date\)\)/);
  assert.match(body, /activity_rank_events e/);
  assert.match(body, /e\.user_id = target_user/);
  assert.match(body, /e\.event_type = 'active_day'/);
});

test("all Steady Penpal grades use the shared profile badge component", () => {
  for (const grade of ["bronze", "silver", "gold", "platinum"]) {
    assert.match(badgeComponent, new RegExp(`steady-penpal-${grade}`));
    assert.match(badgeComponent, new RegExp(`Steady Penpal · ${grade[0].toUpperCase()}${grade.slice(1)}`));
  }
  assert.match(badgeComponent, /"steady-penpal"/);
});

test("Steady Penpal boundaries return only the highest grade and deduplicate days within a month", { skip: !hasLocalDatabase }, () => {
  const sql = `
select 'below_bronze|' || coalesce(public.steady_penpal_grade_for_count(2), 'none');
select 'exactly_bronze|' || coalesce(public.steady_penpal_grade_for_count(3), 'none');
select 'below_silver|' || coalesce(public.steady_penpal_grade_for_count(5), 'none');
select 'exactly_silver|' || coalesce(public.steady_penpal_grade_for_count(6), 'none');
select 'below_gold|' || coalesce(public.steady_penpal_grade_for_count(11), 'none');
select 'exactly_gold|' || coalesce(public.steady_penpal_grade_for_count(12), 'none');
select 'below_platinum|' || coalesce(public.steady_penpal_grade_for_count(23), 'none');
select 'exactly_platinum|' || coalesce(public.steady_penpal_grade_for_count(24), 'none');
begin;
create temp table steady_penpal_badge_target (id uuid) on commit drop;
insert into steady_penpal_badge_target (id)
select p.id
  from public.profiles p
 where p.deactivated_at is null
   and p.inactive_mode = false
   and not exists (
     select 1 from public.activity_rank_events e
      where e.user_id = p.id and e.event_type = 'active_day'
   )
 order by p.id
 limit 1;
insert into public.activity_rank_events (user_id, event_key, event_type, occurred_at)
select t.id, 'steady-badge-january-' || g::text, 'active_day', (date '2020-01-01' + g)::timestamptz
  from steady_penpal_badge_target t
 cross join generate_series(0, 6) as series(g);
select 'same_month_count|' || (select public.steady_penpal_active_month_count(id)::text from steady_penpal_badge_target);
insert into public.activity_rank_events (user_id, event_key, event_type, occurred_at)
select id, 'steady-badge-february', 'active_day', (date '2020-02-01')::timestamptz from steady_penpal_badge_target
union all
select id, 'steady-badge-march', 'active_day', (date '2020-03-01')::timestamptz from steady_penpal_badge_target;
select 'active_month_count|' || (select public.steady_penpal_active_month_count(id)::text from steady_penpal_badge_target);
select 'active_month_grade|' || coalesce((select public.steady_penpal_grade(id) from steady_penpal_badge_target), 'none');
do $$
begin
  perform set_config('request.jwt.claim.sub', (select id::text from steady_penpal_badge_target), false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
end;
$$;
select 'projected_grade_count|' || (
  select count(*)::text
    from public.get_profile_badges((select id from steady_penpal_badge_target)) badges
   where badges.badge_key like 'steady-penpal-%'
);
rollback;`;
  const output = execFileSync("docker", ["exec", "-i", "supabase_db_Penpal", "psql", "-q", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" }).trim().split(/\r?\n/);
  assert.deepEqual(output, [
    "below_bronze|none",
    "exactly_bronze|steady-penpal-bronze",
    "below_silver|steady-penpal-bronze",
    "exactly_silver|steady-penpal-silver",
    "below_gold|steady-penpal-silver",
    "exactly_gold|steady-penpal-gold",
    "below_platinum|steady-penpal-gold",
    "exactly_platinum|steady-penpal-platinum",
    "same_month_count|1",
    "active_month_count|3",
    "active_month_grade|steady-penpal-bronze",
    "projected_grade_count|1",
  ]);
});
