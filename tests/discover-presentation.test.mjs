import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../src/app/app/discover/page.tsx", import.meta.url), "utf8");
const filters = await readFile(new URL("../src/app/app/discover/DiscoverFilters.tsx", import.meta.url), "utf8");
const results = await readFile(new URL("../src/app/app/discover/DiscoverResults.tsx", import.meta.url), "utf8");
const countryFlag = await readFile(new URL("../src/app/components/CountryFlag.tsx", import.meta.url), "utf8");
const globals = await readFile(new URL("../src/app/globals.css", import.meta.url), "utf8");

test("Discover uses the target editorial hierarchy and card grid", () => {
  assert.match(page, /app\.discover\.title/);
  assert.match(page, /app\.discover\.found/);
  assert.match(page, /max-w-\[1580px\]/);
  assert.match(results, /md:grid-cols-2/);
  assert.match(results, /border-\[#deded5\]/);
  assert.match(filters, /FilterIcon/);
  assert.match(filters, /icon="country"/);
  assert.match(filters, /name="recent"/);
});

test("Discover never renders malformed ages as NaN", () => {
  assert.match(page, /Number\.isFinite\(numeric\)/);
  assert.match(results, /Number\.isFinite\(profile\.age\)/);
  assert.doesNotMatch(results, /NaN/);
});

test("Discover pagination and profile return state remain wired", () => {
  assert.match(page, /queryPath\(filters, page - 1\)/);
  assert.match(page, /queryPath\(filters, page \+ 1\)/);
  assert.match(results, /penpal\.discover\.return/);
  assert.match(results, /href=\{`\/profile\/\$\{encodeURIComponent\(profile\.username\)\}`\}/);
});

test("Discover cards render the privacy-aware location and country flag under the name", () => {
  assert.match(page, /location_label: asOptionalString\(profile\.location_label\)/);
  assert.match(page, /country_code: asOptionalString\(profile\.country_code\)/);
  assert.match(results, /<CountryFlag code=\{profile\.country_code\}/);
  assert.match(results, /profile\.location_label\?\.trim\(\)/);
  assert.match(results, /<h2[\s\S]*location[\s\S]*profile\.quote/);
  assert.match(countryFlag, /className=\{`flag:\$\{normalized\}`\}/);
  assert.match(globals, /country-flag-icons\/3x2\/flags\.css/);
  assert.match(countryFlag, /isIsoAlpha2/);
});
