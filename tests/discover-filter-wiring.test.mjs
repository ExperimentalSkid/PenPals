import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const page = await readFile(new URL("src/app/app/discover/page.tsx", root), "utf8");
const filters = await readFile(new URL("src/app/app/discover/DiscoverFilters.tsx", root), "utf8");
const migration = await readFile(new URL("supabase/migrations/20260903200000_add_discover_card_location.sql", root), "utf8");

test("every visible Discover filter has a URL field and server-side RPC argument", () => {
  for (const field of ["country", "region", "gender", "min_age", "max_age", "language_spoken", "language_learning", "interest", "recent"]) {
    assert.match(filters, new RegExp(`name=\\"${field}\\"`), `${field} is not submitted by the filter form`);
  }
  for (const argument of [
    "p_country: filters.country",
    "p_region: filters.region",
    "p_gender: filters.gender",
    "p_min_age: minAge",
    "p_max_age: maxAge",
    "p_language_spoken: filters.language_spoken",
    "p_language_learning: filters.language_learning",
    "p_interest: filters.interest",
    "p_recent: recentOnly",
  ]) {
    assert.ok(page.includes(argument), `${argument} is not passed to the paginated RPC`);
  }
  assert.match(page, /p_page_size: PAGE_SIZE/);
  assert.match(page, /p_page_offset: requestedOffset/);
});

test("the database applies each visible filter before pagination", () => {
  for (const clause of [
    "country_filter",
    "region_filter",
    "gender_filter",
    "p_min_age",
    "p_max_age",
    "spoken_filter",
    "learning_filter",
    "interest_filter",
    "coalesce(p_recent, false)",
  ]) {
    assert.ok(migration.includes(clause), `${clause} is not part of the filtered CTE`);
  }
  assert.match(migration, /from filtered[\s\S]*limit v_page_size[\s\S]*offset v_page_offset/);
});

test("country and region URL state stays hierarchical and clear-all does not restore stale filters", () => {
  assert.match(page, /const regionMatch = normalizedCountry && rawRegion/);
  assert.match(page, /region: regionMatch\?\.value \?\? \"\"/);
  assert.match(page, /rawRegion && !filters\.region/);
  assert.match(page, /recent: rawRecent === \"1\" \|\| rawRecent\.toLowerCase\(\) === \"true\" \? \"1\" : \"\"/);
  assert.match(page, /const recentUrlNeedsNormalization = Boolean\(rawRecent && \(recentOnly \? rawRecent !== \"1\" : true\)\)/);
  assert.match(filters, /values\.country[\s\S]*regions\.filter/);
  assert.match(filters, /sessionStorage\.removeItem\(RETURN_QUERY_KEY\)/);
});

test("age URL values are strict integers within the visible control range", () => {
  assert.match(page, /if \(!\/\^\\d\+\$\/\.test\(normalized\)\)/);
  assert.match(page, /numeric < 13 \|\| numeric > 100/);
  assert.match(page, /parsedMinAge\.value > parsedMaxAge\.value/);
});
