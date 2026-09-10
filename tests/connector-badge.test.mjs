import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { LOCAL_DB_CONTAINER } from "./helpers/local-db.mjs";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20260905270000_connector_badge.sql", root), "utf8");
const badgeComponent = await readFile(new URL("src/lib/profile-badges.ts", root), "utf8");
const hasLocalDatabase = (() => {
  try { execFileSync("docker", ["inspect", LOCAL_DB_CONTAINER], { stdio: "ignore" }); return true; } catch { return false; }
})();

test("Connector thresholds are centralized and system-derived", () => {
  assert.match(migration, /add column if not exists minimum_unique_contacts integer/);
  assert.match(migration, /minimum_unique_contacts is null or minimum_unique_contacts > 0/);
  assert.match(migration, /'connector-bronze'[^\n]*true, 35, 25/);
  assert.match(migration, /'connector-silver'[^\n]*true, 36, 75/);
  assert.match(migration, /'connector-gold'[^\n]*true, 37, 150/);
  assert.match(migration, /'connector-platinum'[^\n]*true, 38, 300/);
  assert.match(migration, /connector_unique_contact_count/);
  assert.match(migration, /connector_grade_for_count/);
  assert.match(migration, /connector_grade\(target_user uuid\)/);
  assert.match(migration, /create or replace function public\.get_profile_badges/);
  assert.match(migration, /create or replace function public\.admin_get_profile_badges/);
  assert.match(migration, /public\.connector_grade\(target_user\)/);
});

test("Connector counts distinct other conversation participants", () => {
  const countStart = migration.indexOf("create or replace function public.connector_unique_contact_count");
  const countEnd = migration.indexOf("revoke all on function public.connector_unique_contact_count", countStart);
  assert.notEqual(countStart, -1);
  assert.notEqual(countEnd, -1);
  const body = migration.slice(countStart, countEnd);
  assert.match(body, /conversation_participants own_participant/);
  assert.match(body, /conversation_participants other_participant/);
  assert.match(body, /count\(distinct other_participant\.user_id\)/);
  assert.match(body, /other_participant\.user_id <> target_user/);
  assert.match(body, /own_participant\.user_id = target_user/);
  assert.doesNotMatch(body, /messages|conversation_introductions|auth\.users/i);
});

test("all Connector grades use the shared badge component", () => {
  for (const grade of ["bronze", "silver", "gold", "platinum"]) {
    assert.match(badgeComponent, new RegExp(`connector-${grade}`));
    assert.match(badgeComponent, new RegExp(`Connector · ${grade[0].toUpperCase()}${grade.slice(1)}`));
  }
  assert.match(badgeComponent, /"connector"/);
});

test("Connector boundaries return only the highest qualifying grade", { skip: !hasLocalDatabase }, () => {
  const sql = `
select 'below_bronze|' || coalesce(public.connector_grade_for_count(24), 'none');
select 'exactly_bronze|' || coalesce(public.connector_grade_for_count(25), 'none');
select 'below_silver|' || coalesce(public.connector_grade_for_count(74), 'none');
select 'exactly_silver|' || coalesce(public.connector_grade_for_count(75), 'none');
select 'below_gold|' || coalesce(public.connector_grade_for_count(149), 'none');
select 'exactly_gold|' || coalesce(public.connector_grade_for_count(150), 'none');
select 'below_platinum|' || coalesce(public.connector_grade_for_count(299), 'none');
select 'exactly_platinum|' || coalesce(public.connector_grade_for_count(300), 'none');
begin;
create temp table connector_badge_target (id uuid, contact_a uuid, contact_b uuid) on commit drop;
with fixture as (
  select gen_random_uuid() as id, gen_random_uuid() as contact_a, gen_random_uuid() as contact_b,
         'connector_' || left(replace(gen_random_uuid()::text, '-', ''), 10) as prefix
), users as (
  insert into auth.users(id, email, email_confirmed_at)
  select id, id::text || '@example.test', now() from fixture
  union all select contact_a, contact_a::text || '@example.test', now() from fixture
  union all select contact_b, contact_b::text || '@example.test', now() from fixture
  returning id
), profiles as (
  insert into public.profiles(id, username, display_name, birth_date, gender, country, country_code, city, location_precision, bio, quote, looking_for)
  select id, prefix || '_t', 'Connector Target', date '1990-01-01', 'Not specified', 'NO', 'NO', '', 'country', 'Connector fixture bio.', 'A fixture quote.', 'friendship' from fixture
  union all select contact_a, prefix || '_a', 'Connector Contact A', date '1990-01-01', 'Not specified', 'SE', 'SE', '', 'country', 'Connector fixture bio.', 'A fixture quote.', 'friendship' from fixture
  union all select contact_b, prefix || '_b', 'Connector Contact B', date '1990-01-01', 'Not specified', 'ES', 'ES', '', 'country', 'Connector fixture bio.', 'A fixture quote.', 'friendship' from fixture
  returning id
)
insert into connector_badge_target (id, contact_a, contact_b)
select id, contact_a, contact_b from fixture;
with created as (insert into public.conversations default values returning id)
insert into public.conversation_participants(conversation_id, user_id)
select c.id, t.id from created c cross join connector_badge_target t
union all
select c.id, t.contact_a from created c cross join connector_badge_target t;
select 'one_contact|' || (select public.connector_unique_contact_count(id)::text from connector_badge_target);
with created as (insert into public.conversations default values returning id)
insert into public.conversation_participants(conversation_id, user_id)
select c.id, t.id from created c cross join connector_badge_target t
union all
select c.id, t.contact_a from created c cross join connector_badge_target t;
select 'repeated_contact|' || (select public.connector_unique_contact_count(id)::text from connector_badge_target);
with created as (insert into public.conversations default values returning id)
insert into public.conversation_participants(conversation_id, user_id)
select c.id, t.id from created c cross join connector_badge_target t
union all
select c.id, t.contact_b from created c cross join connector_badge_target t;
select 'two_contacts|' || (select public.connector_unique_contact_count(id)::text from connector_badge_target);
select 'actual_grade|' || coalesce((select public.connector_grade(id) from connector_badge_target), 'none');
rollback;`;
  const output = execFileSync("docker", ["exec", "-i", LOCAL_DB_CONTAINER, "psql", "-q", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" }).trim().split(/\r?\n/);
  assert.deepEqual(output, [
    "below_bronze|none",
    "exactly_bronze|connector-bronze",
    "below_silver|connector-bronze",
    "exactly_silver|connector-silver",
    "below_gold|connector-silver",
    "exactly_gold|connector-gold",
    "below_platinum|connector-gold",
    "exactly_platinum|connector-platinum",
    "one_contact|1",
    "repeated_contact|1",
    "two_contacts|2",
    "actual_grade|none",
  ]);
});
