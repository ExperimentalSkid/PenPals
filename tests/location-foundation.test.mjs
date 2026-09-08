import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20260903010000_location_and_friendship_destinations.sql", root), "utf8");
const countries = await readFile(new URL("src/lib/countries.ts", root), "utf8");
const setup = await readFile(new URL("src/app/app/profile/setup/page.tsx", root), "utf8");
const completion = await readFile(new URL("src/lib/profile-completeness.ts", root), "utf8");
const locationEditor = await readFile(new URL("src/app/app/profile/setup/LocationEditor.tsx", root), "utf8");
const destinations = await readFile(new URL("src/app/app/profile/setup/FriendshipDestinationPicker.tsx", root), "utf8");
const discover = await readFile(new URL("src/app/app/discover/page.tsx", root), "utf8");
const discoverFilters = await readFile(new URL("src/app/app/discover/DiscoverFilters.tsx", root), "utf8");
const exclusions = await readFile(new URL("src/app/app/settings/CountryExclusionPicker.tsx", root), "utf8");
const settings = await readFile(new URL("src/app/app/settings/page.tsx", root), "utf8");
const profileActions = await readFile(new URL("src/app/app/profile/actions.ts", root), "utf8");
const publicProfilePage = await readFile(new URL("src/app/app/profile/[username]/page.tsx", root), "utf8");
const profileView = await readFile(new URL("src/app/app/profile/[username]/ProfileView.tsx", root), "utf8");
const destinationSection = await readFile(new URL("src/app/app/profile/[username]/FriendshipDestinationsSection.tsx", root), "utf8");
const introductionsPage = await readFile(new URL("src/app/app/introductions/page.tsx", root), "utf8");
const messagesPage = await readFile(new URL("src/app/app/messages/inbox-profiles.ts", root), "utf8");
const integrity = await readFile(new URL("supabase/migrations/20260904150000_profile_location_integrity.sql", root), "utf8");
const nameConsistency = await readFile(new URL("supabase/migrations/20260904151000_profile_location_name_consistency.sql", root), "utf8");
const destinationFlow = await readFile(new URL("supabase/migrations/20260904152000_friendship_destination_flow.sql", root), "utf8");
const legacyEdit = await readFile(new URL("supabase/migrations/20260904223000_allow_legacy_profile_location_edits.sql", root), "utf8");

test("the shared country source is complete and reused by every location surface", () => {
  const codeBlock = countries.match(/const COUNTRY_CODES = `([\s\S]*?)`\.trim\(\)/)?.[1] ?? "";
  assert.equal(codeBlock.trim().split(/\s+/).length, 249);
  for (const source of [locationEditor, destinations, discover, settings]) assert.match(source, /COUNTRY_OPTIONS/);
  assert.match(setup, /<LocationEditor/);
  assert.match(exclusions, /countries\.map/);
});

test("normalized location catalogs and profile precision are schema-backed", () => {
  assert.match(migration, /create table if not exists public\.location_regions/i);
  assert.match(migration, /create table if not exists public\.location_localities/i);
  assert.match(migration, /add column if not exists country_code text/i);
  assert.match(migration, /add column if not exists region_code text/i);
  assert.match(migration, /add column if not exists locality_id bigint/i);
  assert.match(migration, /add column if not exists location_precision text/i);
  assert.match(migration, /location_precision in \('country', 'region', 'locality'\)/i);
});

test("legacy location values are preserved while only unambiguous values are backfilled", () => {
  assert.match(migration, /original country\/city values remain[\s\S]*untouched/i);
  assert.match(migration, /where p\.country_code is null[\s\S]*lower\(trim\(c\.name\)\)/i);
  assert.match(migration, /where p\.locality_id is null[\s\S]*lower\(trim\(l\.name\)\)/i);
});

test("profile edits keep unresolved legacy locations editable", () => {
  assert.match(legacyEdit, /create or replace function public\.save_profile/);
  assert.match(legacyEdit, /if clean_country_code is null then[\s\S]*canonical_country := clean_country/);
  assert.match(legacyEdit, /clean_region_code := null[\s\S]*p_locality_id := null/);
  assert.match(legacyEdit, /if clean_country_code is not null then[\s\S]*A region is required for this precision/);
  assert.match(legacyEdit, /grant execute on function public\.save_profile/);
});

test("location selectors clear incompatible precision fields", () => {
  assert.match(locationEditor, /setRegionCode\(""\);[\s\S]*setLocalityId\(""\);[\s\S]*setLocalityName\(""\)/);
  assert.match(locationEditor, /const selectRegion[\s\S]*setLocalityId\(""\);[\s\S]*setLocalityName\(""\)/);
  assert.match(locationEditor, /name="location_precision"/);
  assert.match(locationEditor, /name="country_code"/);
  assert.match(locationEditor, /name="region_code"/);
  assert.match(locationEditor, /name="locality_id"/);
});

test("locality input follows the normalized country → region hierarchy", () => {
  assert.match(locationEditor, /required=\{Boolean\(countryCode && regionCode\)\}/);
  assert.match(locationEditor, /disabled=\{!countryCode \|\| !regionCode\}/);
  assert.match(locationEditor, /Choose a country and region before searching for a city \/ town/);
  assert.match(locationEditor, /Suggestions are scoped to your country and region/);
});

test("region and locality suggestions are scoped and major entries sort first", () => {
  assert.match(locationEditor, /regions\.filter\(.*country_code === countryCode/);
  assert.match(locationEditor, /localities[\s\S]*country_code === countryCode[\s\S]*region_code === regionCode/);
  assert.match(locationEditor, /is_major\).*localeCompare/);
  assert.match(locationEditor, /role="combobox"/);
  assert.match(locationEditor, /ArrowDown/);
  assert.match(locationEditor, /ArrowUp/);
});

test("friendship destinations are separate, normalized, capped, and removable", () => {
  assert.match(migration, /create table if not exists public\.profile_friendship_destinations/i);
  assert.match(migration, /create table if not exists public\.location_configuration/i);
  assert.match(migration, /max_friendship_destinations smallint/i);
  assert.match(migration, /profile_friendship_destinations_unique/i);
  assert.match(migration, /jsonb_array_length\(destination_rows\) > coalesce\(destination_limit, 5\)/i);
  assert.match(destinations, /DEFAULT_MAX_DESTINATIONS = 5/);
  assert.match(destinations, /destinations\.length >= destinationLimit/);
  assert.match(destinations, /friendship_destinations/);
  assert.match(destinations, /Remove/);
  assert.doesNotMatch(destinations, /locality|city/i);
});

test("friendship destination max and duplicate feedback stay coherent with server validation", () => {
  assert.match(destinations, /maxDestinations\?/);
  assert.match(destinations, /That destination is already selected/);
  assert.match(destinations, /You can choose up to/);
  assert.match(setup, /get_friendship_destination_limit/);
  assert.match(setup, /maxDestinations=\{destinationLimit\}/);
  assert.match(destinationFlow, /revoke insert, update, delete on table public\.profile_friendship_destinations from authenticated/i);
  assert.match(destinationFlow, /get_friendship_destination_limit\(\)/i);
});

test("destination rows resolve region names independently of the transient picker state", () => {
  assert.match(destinations, /regions\.find\(\(region\) => region\.code === code\?\.trim\(\)\.toUpperCase\(\)\)/);
});

test("destination writes are owner-only and validated server-side", () => {
  assert.match(migration, /profile_id = auth\.uid\(\)/i);
  assert.match(migration, /Invalid friendship destination/i);
  assert.match(migration, /Duplicate friendship destination/i);
  assert.match(migration, /grant select, insert, update, delete on table public\.profile_friendship_destinations to authenticated/i);
});

test("Discover uses country and optional region filters, with no city filter or proximity ranking", () => {
  assert.match(discover, /location_regions/);
  assert.match(discover, /normalizedCountry[\s\S]*region\.country_code/);
  assert.match(discover, /region:/);
  assert.match(discoverFilters, /label="Region"/);
  assert.match(discoverFilters, /name="region"/);
  assert.doesNotMatch(discoverFilters, /label="City"|name="city"/);
  assert.match(discover, /first\(params\.city\)[\s\S]*redirect\(queryPath\(filters, page\)\)/);
  assert.doesNotMatch(discover, /nearest|distance|proximity|geo/i);
  assert.match(migration, /order by p\.last_active_at desc nulls last,p\.created_at desc/i);
});

test("Discover retains existing filter URL and pagination semantics", () => {
  assert.match(discover, /queryPath\(filters, page\)/);
  assert.match(discoverFilters, /method="get" action="\/app\/discover"/);
  assert.match(discoverFilters, /name="page" value="1"/);
  assert.match(discoverFilters, /Clear all/);
});

test("selected precision controls public location disclosure", () => {
  assert.match(migration, /location_label := case/);
  assert.match(migration, /when p\.location_precision='country'/i);
  assert.match(migration, /when p\.location_precision='region'/i);
  assert.match(migration, /when p\.show_city and p\.location_precision='locality'/i);
  assert.match(migration, /'location_precision',p\.location_precision/i);
  assert.match(migration, /nullif\(region_name, coalesce\(locality_name/);
});

test("profile completion and public consumers honor normalized precision fallbacks", () => {
  assert.match(setup, /profileCompletionProgress\(profile \?\? \{\}, selectedLanguages\.length, selectedInterests\.length\)/);
  assert.match(completion, /profile\.country\?\.trim\(\)/);
  assert.match(completion, /profile\.city\?\.trim\(\)/);
  assert.match(completion, /effectiveLocationPrecision === "region"/);
  assert.match(profileActions, /p_location_precision: locationPrecision/);
  for (const source of [publicProfilePage, introductionsPage, messagesPage]) {
    assert.match(source, /location_label/);
    assert.match(source, /publicProfile\?\.country|profile\.country/);
    assert.doesNotMatch(source, /\[publicProfile\??\.city, publicProfile\??\.country\]/);
  }
});

test("the save RPC validates precision and writes normalized location plus destinations atomically", () => {
  assert.match(migration, /create or replace function public\.save_profile\([\s\S]*p_location_precision text[\s\S]*p_friendship_destinations jsonb/i);
  assert.match(migration, /A region is required for this precision/i);
  assert.match(migration, /A city or town is required for this precision/i);
  assert.match(migration, /insert into public\.profile_friendship_destinations/i);
  assert.match(setup, /<LocationEditor/);
  assert.match(setup, /<FriendshipDestinationPicker/);
  for (const parameter of ["p_country_code", "p_region_code", "p_locality_id", "p_location_precision", "p_friendship_destinations"]) {
    assert.match(profileActions, new RegExp(`${parameter}:`));
  }
});

test("all profile write paths preserve country → region → locality integrity", () => {
  assert.match(integrity, /create or replace function public\.validate_profile_location_hierarchy/i);
  assert.match(integrity, /Normalized location requires a country/i);
  assert.match(integrity, /Invalid region for country/i);
  assert.match(integrity, /Invalid locality for region/i);
  assert.match(integrity, /profiles_location_hierarchy_guard/i);
  assert.match(integrity, /before insert or update of country_code, region_code, locality_id, location_precision/i);
  assert.match(integrity, /revoke all on function public\.validate_profile_location_hierarchy\(\) from public, anon, authenticated/i);
  assert.match(nameConsistency, /before insert or update of country, city, country_code, region_code, locality_id, location_precision/i);
  assert.match(nameConsistency, /Country name does not match country code/i);
  assert.match(nameConsistency, /Locality name does not match locality/i);
});

test("public profiles present friendship destinations separately from home location", () => {
  assert.match(destinationFlow, /get_public_friendship_destinations\(target_user uuid\)/i);
  assert.match(destinationFlow, /country_name/);
  assert.match(destinationFlow, /region_name/);
  assert.match(destinationFlow, /viewer_can_access_profile\(p\.id\)/);
  assert.match(destinationFlow, /revoke all on function public\.get_public_friendship_destinations\(uuid\) from public, anon/i);
  assert.match(publicProfilePage, /get_public_friendship_destinations/);
  assert.match(publicProfilePage, /friendshipDestinations/);
  assert.match(profileView, /FriendshipDestinationsSection/);
  assert.match(destinationSection, /separate from their home location/);
  assert.match(destinationSection, /CountryFlag/);
  assert.doesNotMatch(profileView, /nearest|proximity|mixing/i);
});
