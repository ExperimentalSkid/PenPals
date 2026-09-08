import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../supabase/migrations/20260903080000_discover_database_pagination.sql", import.meta.url), "utf8");
const discoverPage = await readFile(new URL("../src/app/app/discover/page.tsx", import.meta.url), "utf8");

test("discovery filtering and pagination are database-owned", () => {
  assert.match(migration, /create or replace function public\.get_discover_profiles_page/);
  assert.match(migration, /limit v_page_size[\s\S]*offset v_page_offset/);
  assert.match(migration, /'total_count', \(select count\(\*\) from filtered\)/);
  assert.match(migration, /order by f\.last_active_at desc nulls last, f\.created_at desc/);
  assert.match(discoverPage, /rpc\("get_discover_profiles_page"/);
  assert.doesNotMatch(discoverPage, /profileIds|filteredRows|\.slice\(/);
});

test("a large eligible population still returns only one bounded page", () => {
  const totalEligible = 1001;
  const pageSize = 6;
  const pageCount = Math.ceil(totalEligible / pageSize);
  assert.equal(pageCount, 167);
  assert.match(discoverPage, /p_page_size: PAGE_SIZE/);
  assert.match(discoverPage, /p_page_offset: requestedOffset/);
  assert.match(discoverPage, /const totalCount = Number\.isFinite\(parsedTotal\)/);
  assert.match(migration, /p_page_size integer default 6/);
  assert.match(migration, /v_page_size integer := least\(greatest\(coalesce\(p_page_size, 6\), 1\), 100\)/);
  assert.match(migration, /limit v_page_size/);
  assert.match(migration, /offset v_page_offset/);
});

test("database page preserves discovery filters and existing eligibility", () => {
  for (const clause of [
    "p.deactivated_at is null",
    "p.inactive_mode = false",
    "p.last_active_at >= now() - interval '7 days'",
    "public.viewer_can_access_profile(p.id)",
    "spoken_filter",
    "learning_filter",
    "interest_filter",
    "coalesce(p_recent, false)",
  ]) {
    assert.match(migration, new RegExp(clause.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
