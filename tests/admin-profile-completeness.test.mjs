import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20260903090000_fix_admin_profile_completeness_location_precision.sql", root), "utf8");
const adminUsersPage = await readFile(new URL("src/app/app/admin/users/page.tsx", root), "utf8");
const adminUserDetail = await readFile(new URL("src/app/app/admin/users/[id]/page.tsx", root), "utf8");

test("admin directory completeness accepts country and region precision without a city", () => {
  const locationRule = /p\.location_precision in \('country', 'region'\) or nullif\(trim\(p\.city\), ''\) is not null/;
  assert.equal((migration.match(new RegExp(locationRule.source, "g")) ?? []).length, 3);
  assert.match(migration, /create or replace function public\.admin_list_users_page/);
  assert.match(migration, /create or replace function public\.admin_list_users\(/);
});

test("admin user detail returns the same precision-aware completeness value", () => {
  assert.match(migration, /alter function public\.admin_get_user_detail\(uuid\) rename to admin_get_user_detail_legacy/);
  assert.match(migration, /jsonb_set\(result, '\{profile,profile_complete\}', to_jsonb\(coalesce\(complete, false\)\), true\)/);
  assert.match(migration, /p\.location_precision in \('country', 'region'\) or nullif\(trim\(p\.city\), ''\) is not null/);
  assert.match(adminUsersPage, /profile_complete/);
  assert.match(adminUserDetail, /profile\.profile_complete/);
});

test("locality precision still requires a city while country and region precision do not", () => {
  const expression = "p.location_precision in ('country', 'region') or nullif(trim(p.city), '') is not null";
  assert.ok(migration.includes(expression));
  assert.doesNotMatch(migration, /nullif\(trim\(p\.city\), ''\) is not null\s*and\s*nullif\(trim\(p\.bio\)/);
});
