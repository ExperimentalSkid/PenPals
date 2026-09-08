import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20260905270000_connector_badge.sql", root), "utf8");
const badgeComponent = await readFile(new URL("src/lib/profile-badges.ts", root), "utf8");
const hasLocalDatabase = (() => {
  try { execFileSync("docker", ["inspect", "supabase_db_Penpal"], { stdio: "ignore" }); return true; } catch { return false; }
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
insert into connector_badge_target (id, contact_a, contact_b)
select target.id, first_contact.id, second_contact.id
  from public.profiles target
  cross join lateral (
    select p.id
      from public.profiles p
     where p.id <> target.id
       and p.deactivated_at is null
       and p.inactive_mode = false
       and not exists (
         select 1 from public.conversation_participants cp
          where cp.user_id = p.id
       )
     order by p.id
     limit 1
  ) first_contact
  cross join lateral (
    select p.id
      from public.profiles p
     where p.id not in (target.id, first_contact.id)
       and p.deactivated_at is null
       and p.inactive_mode = false
       and not exists (
         select 1 from public.conversation_participants cp
          where cp.user_id = p.id
       )
     order by p.id
     limit 1
  ) second_contact
 where target.deactivated_at is null
   and target.inactive_mode = false
   and not exists (
     select 1 from public.conversation_participants cp
      where cp.user_id = target.id
   )
 order by target.id
 limit 1;
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
  const output = execFileSync("docker", ["exec", "-i", "supabase_db_Penpal", "psql", "-q", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" }).trim().split(/\r?\n/);
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
