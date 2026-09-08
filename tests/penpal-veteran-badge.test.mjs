import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20260905230000_penpal_veteran_badge.sql", root), "utf8");
const badgeComponent = await readFile(new URL("src/lib/profile-badges.ts", root), "utf8");
const adminBadgeActions = await readFile(new URL("src/app/app/admin/users/[id]/AdminProfileBadgeActions.tsx", root), "utf8");
const publicProjection = await readFile(new URL("supabase/migrations/20260905221000_profile_badge_order.sql", root), "utf8");
const hasLocalDatabase = (() => {
  try { execFileSync("docker", ["inspect", "supabase_db_Penpal"], { stdio: "ignore" }); return true; } catch { return false; }
})();

test("Penpal Veteran definitions keep tenure thresholds centralized and system-derived", () => {
  assert.match(migration, /add column if not exists minimum_tenure interval/);
  assert.match(migration, /minimum_tenure is null or minimum_tenure > interval '0 seconds'/);
  assert.match(migration, /auth\.users u[\s\S]*u\.created_at/);
  assert.match(migration, /interval '3 months'/);
  assert.match(migration, /interval '6 months'/);
  assert.match(migration, /interval '1 year'/);
  assert.match(migration, /interval '3 years'/);
  assert.match(migration, /penpal_veteran_grade/);
  assert.match(migration, /order by d\.minimum_tenure desc[\s\S]*limit 1/);
  assert.match(migration, /'penpal-veteran-bronze'[\s\S]*true/);
  assert.match(migration, /'penpal-veteran-platinum'[\s\S]*true/);
});

test("all veteran grades are represented by the shared profile badge component", () => {
  for (const grade of ["bronze", "silver", "gold", "platinum"]) {
    assert.match(badgeComponent, new RegExp(`penpal-veteran-${grade}`));
    assert.match(badgeComponent, new RegExp(`Penpal Veteran · ${grade[0].toUpperCase()}${grade.slice(1)}`));
  }
  assert.match(badgeComponent, /"penpal-veteran"/);
});

test("public and staff projections include the derived veteran grade", () => {
  assert.match(migration, /create or replace function public\.get_profile_badges/);
  assert.match(migration, /create or replace function public\.admin_get_profile_badges/);
  assert.match(migration, /from auth\.users u/);
  assert.match(migration, /public\.penpal_veteran_grade\(u\.created_at, now\(\)\)/);
  assert.match(publicProjection, /create or replace function public\.get_profile_badges/);
  assert.match(adminBadgeActions, /badge\.is_derived === true/);
  assert.match(adminBadgeActions, /derived\.map/);
});

test("veteran grade boundaries return only the highest qualifying grade", { skip: !hasLocalDatabase }, () => {
  const sql = `
select 'below_3_months|' || coalesce(public.penpal_veteran_grade('2026-06-05 00:00:01+00', '2026-09-05 00:00:00+00'), 'none');
select 'exactly_3_months|' || coalesce(public.penpal_veteran_grade('2026-06-05 00:00:00+00', '2026-09-05 00:00:00+00'), 'none');
select 'exactly_6_months|' || coalesce(public.penpal_veteran_grade('2026-03-05 00:00:00+00', '2026-09-05 00:00:00+00'), 'none');
select 'exactly_1_year|' || coalesce(public.penpal_veteran_grade('2025-09-05 00:00:00+00', '2026-09-05 00:00:00+00'), 'none');
select 'exactly_3_years|' || coalesce(public.penpal_veteran_grade('2023-09-05 00:00:00+00', '2026-09-05 00:00:00+00'), 'none');
select 'above_platinum|' || coalesce(public.penpal_veteran_grade('2020-01-01 00:00:00+00', '2026-09-05 00:00:00+00'), 'none');`;
  const output = execFileSync("docker", ["exec", "-i", "supabase_db_Penpal", "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" }).trim().split(/\r?\n/);
  assert.deepEqual(output, [
    "below_3_months|none",
    "exactly_3_months|penpal-veteran-bronze",
    "exactly_6_months|penpal-veteran-silver",
    "exactly_1_year|penpal-veteran-gold",
    "exactly_3_years|penpal-veteran-platinum",
    "above_platinum|penpal-veteran-platinum",
  ]);
});
