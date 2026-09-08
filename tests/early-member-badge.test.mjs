import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20260905300000_early_member_badge.sql", root), "utf8");
const badgeComponent = await readFile(new URL("src/lib/profile-badges.ts", root), "utf8");
const hasLocalDatabase = (() => {
  try { execFileSync("docker", ["inspect", "supabase_db_Penpal"], { stdio: "ignore" }); return true; } catch { return false; }
})();

test("Early Member launch anchor and windows are centralized and system-derived", () => {
  assert.match(migration, /penpals_official_launch_at/);
  assert.match(migration, /2026-09-01 00:00:00\+00/);
  assert.match(migration, /add column if not exists maximum_launch_age interval/);
  assert.match(migration, /maximum_launch_age is null or maximum_launch_age > interval '0 seconds'/);
  assert.match(migration, /'early-member-bronze'[\s\S]*true, 43, interval '12 months'/);
  assert.match(migration, /'early-member-silver'[\s\S]*true, 44, interval '6 months'/);
  assert.match(migration, /'early-member-gold'[\s\S]*true, 45, interval '3 months'/);
  assert.match(migration, /'early-member-platinum'[\s\S]*true, 46, interval '30 days'/);
  assert.match(migration, /auth\.users u[\s\S]*u\.created_at/);
  assert.match(migration, /order by d\.maximum_launch_age asc[\s\S]*limit 1/);
  assert.match(migration, /early_member_grade\(target_user uuid\)/);
});

test("all Early Member grades use the shared profile badge component", () => {
  for (const grade of ["bronze", "silver", "gold", "platinum"]) {
    assert.match(badgeComponent, new RegExp(`early-member-${grade}`));
    assert.match(badgeComponent, new RegExp(`Early Member · ${grade[0].toUpperCase()}${grade.slice(1)}`));
  }
  assert.match(badgeComponent, /tone: "early-member"/);
});

test("public and staff projections include the derived Early Member grade", () => {
  assert.match(migration, /create or replace function public\.get_profile_badges/);
  assert.match(migration, /create or replace function public\.admin_get_profile_badges/);
  assert.match(migration, /select public\.early_member_grade\(target_user\)/);
  assert.match(migration, /where d\.badge_key = early_member_badge_key/);
  assert.match(migration, /not d\.is_system_derived/);
});

test("Early Member boundaries return only the highest qualifying grade", { skip: !hasLocalDatabase }, () => {
  const sql = `
select 'inside_30_days|' || coalesce(public.early_member_grade_for_created_at('2026-09-30 00:00:00+00', '2026-09-01 00:00:00+00'), 'none');
select 'after_30_inside_3_months|' || coalesce(public.early_member_grade_for_created_at('2026-10-01 00:00:01+00', '2026-09-01 00:00:00+00'), 'none');
select 'after_3_inside_6_months|' || coalesce(public.early_member_grade_for_created_at('2026-12-01 00:00:01+00', '2026-09-01 00:00:00+00'), 'none');
select 'after_6_inside_12_months|' || coalesce(public.early_member_grade_for_created_at('2027-03-01 00:00:01+00', '2026-09-01 00:00:00+00'), 'none');
select 'after_12_months|' || coalesce(public.early_member_grade_for_created_at('2027-09-01 00:00:01+00', '2026-09-01 00:00:00+00'), 'none');
select 'before_launch|' || coalesce(public.early_member_grade_for_created_at('2026-08-31 23:59:59+00', '2026-09-01 00:00:00+00'), 'none');
select 'exactly_30_days|' || coalesce(public.early_member_grade_for_created_at('2026-10-01 00:00:00+00', '2026-09-01 00:00:00+00'), 'none');
select 'exactly_3_months|' || coalesce(public.early_member_grade_for_created_at('2026-12-01 00:00:00+00', '2026-09-01 00:00:00+00'), 'none');
select 'exactly_6_months|' || coalesce(public.early_member_grade_for_created_at('2027-03-01 00:00:00+00', '2026-09-01 00:00:00+00'), 'none');
select 'exactly_12_months|' || coalesce(public.early_member_grade_for_created_at('2027-09-01 00:00:00+00', '2026-09-01 00:00:00+00'), 'none');`;
  const output = execFileSync("docker", ["exec", "-i", "supabase_db_Penpal", "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" }).trim().split(/\r?\n/);
  assert.deepEqual(output, [
    "inside_30_days|early-member-platinum",
    "after_30_inside_3_months|early-member-gold",
    "after_3_inside_6_months|early-member-silver",
    "after_6_inside_12_months|early-member-bronze",
    "after_12_months|none",
    "before_launch|none",
    "exactly_30_days|early-member-platinum",
    "exactly_3_months|early-member-gold",
    "exactly_6_months|early-member-silver",
    "exactly_12_months|early-member-bronze",
  ]);
});
