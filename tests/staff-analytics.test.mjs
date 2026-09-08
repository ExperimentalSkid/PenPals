import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const [migration, page, navigation] = await Promise.all([
  read("supabase/migrations/20260904200000_staff_analytics.sql"),
  read("src/app/app/admin/analytics/page.tsx"),
  read("src/app/app/AppNavigation.tsx"),
]);

test("staff analytics are aggregate-only, role-gated, and read-only", () => {
  assert.match(migration, /create or replace function public\.admin_analytics_summary/);
  assert.match(migration, /if not public\.is_moderator\(\)/);
  assert.match(migration, /period_start date/);
  assert.match(migration, /period_end date/);
  assert.match(migration, /revoke all on function public\.admin_analytics_summary/);
  assert.match(migration, /grant execute on function public\.admin_analytics_summary\(date, date\) to authenticated/);
  assert.match(page, /requireStaff/);
  assert.match(page, /Custom range/);
  assert.match(page, /admin_analytics_summary/);
  assert.match(page, /Read-only aggregate metrics/);
});

test("analytics is available only in the role-gated staff navigation", () => {
  assert.match(navigation, /app\/admin\/analytics/);
  assert.match(navigation, /role === "admin" \|\| role === "moderator"/);
});
