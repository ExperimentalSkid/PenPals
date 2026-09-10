import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { LOCAL_DB_CONTAINER } from "./helpers/local-db.mjs";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20260905320000_icebreaker_badge.sql", root), "utf8");
const badgeComponent = await readFile(new URL("src/lib/profile-badges.ts", root), "utf8");
const hasLocalDatabase = (() => {
  try { execFileSync("docker", ["inspect", LOCAL_DB_CONTAINER], { stdio: "ignore" }); return true; } catch { return false; }
})();

test("Icebreaker thresholds are centralized and system-derived", () => {
  assert.match(migration, /add column if not exists minimum_introductions integer/);
  assert.match(migration, /minimum_introductions is null or minimum_introductions > 0/);
  assert.match(migration, /'icebreaker-bronze'[^\n]*true, 51, 10/);
  assert.match(migration, /'icebreaker-silver'[^\n]*true, 52, 50/);
  assert.match(migration, /'icebreaker-gold'[^\n]*true, 53, 200/);
  assert.match(migration, /'icebreaker-platinum'[^\n]*true, 54, 500/);
  assert.match(migration, /icebreaker_introduction_count/);
  assert.match(migration, /icebreaker_grade_for_count/);
  assert.match(migration, /icebreaker_grade\(target_user uuid\)/);
  assert.match(migration, /create or replace function public\.get_profile_badges/);
  assert.match(migration, /create or replace function public\.admin_get_profile_badges/);
});

test("Icebreaker counts distinct sent introduction records regardless of status", () => {
  const countStart = migration.indexOf("create or replace function public.icebreaker_introduction_count");
  const countEnd = migration.indexOf("revoke all on function public.icebreaker_introduction_count", countStart);
  assert.notEqual(countStart, -1);
  assert.notEqual(countEnd, -1);
  const body = migration.slice(countStart, countEnd);
  assert.match(body, /count\(distinct i\.id\)/);
  assert.match(body, /conversation_introductions i/);
  assert.match(body, /i\.sender_id = target_user/);
  assert.doesNotMatch(body, /i\.status/);
  assert.doesNotMatch(body, /i\.recipient_id = target_user/);
});

test("all Icebreaker grades use the shared profile badge component", () => {
  for (const grade of ["bronze", "silver", "gold", "platinum"]) {
    assert.match(badgeComponent, new RegExp(`icebreaker-${grade}`));
    assert.match(badgeComponent, new RegExp(`Icebreaker · ${grade[0].toUpperCase()}${grade.slice(1)}`));
  }
  assert.match(badgeComponent, /"icebreaker"/);
});

test("Icebreaker boundaries return only the highest grade and status does not alter raw sent count", { skip: !hasLocalDatabase }, () => {
  const sql = `
select 'below_bronze|' || coalesce(public.icebreaker_grade_for_count(9), 'none');
select 'exactly_bronze|' || coalesce(public.icebreaker_grade_for_count(10), 'none');
select 'below_silver|' || coalesce(public.icebreaker_grade_for_count(49), 'none');
select 'exactly_silver|' || coalesce(public.icebreaker_grade_for_count(50), 'none');
select 'below_gold|' || coalesce(public.icebreaker_grade_for_count(199), 'none');
select 'exactly_gold|' || coalesce(public.icebreaker_grade_for_count(200), 'none');
select 'below_platinum|' || coalesce(public.icebreaker_grade_for_count(499), 'none');
select 'exactly_platinum|' || coalesce(public.icebreaker_grade_for_count(500), 'none');
begin;
create temp table icebreaker_badge_target (id uuid) on commit drop;
create temp table icebreaker_badge_recipients (id uuid, ordinal integer) on commit drop;
with fixture as (
  select gen_random_uuid() as id, 'ib_' || left(replace(gen_random_uuid()::text, '-', ''), 10) as username
), auth_insert as (
  insert into auth.users(id, email, email_confirmed_at) select id, id::text || '@example.test', now() from fixture returning id
), profile_insert as (
  insert into public.profiles(id, username, display_name, birth_date, gender, country, country_code, city, location_precision, bio, quote, looking_for)
  select id, username, 'Icebreaker Target', date '1990-01-01', 'Not specified', 'NO', 'NO', '', 'country', 'Fixture bio.', 'Fixture quote.', 'friendship' from fixture returning id
)
insert into icebreaker_badge_target(id) select id from profile_insert;
with fixtures as (
  select gen_random_uuid() as id, g as ordinal, 'ibr_' || left(replace(gen_random_uuid()::text, '-', ''), 8) || '_' || g::text as username from generate_series(1,10) g
), auth_insert as (
  insert into auth.users(id, email, email_confirmed_at) select id, id::text || '@example.test', now() from fixtures returning id
), profile_insert as (
  insert into public.profiles(id, username, display_name, birth_date, gender, country, country_code, city, location_precision, bio, quote, looking_for)
  select id, username, 'Icebreaker Recipient', date '1990-01-01', 'Not specified', 'NO', 'NO', '', 'country', 'Fixture bio.', 'Fixture quote.', 'friendship' from fixtures returning id
)
insert into icebreaker_badge_recipients(id, ordinal) select f.id, f.ordinal from fixtures f;
insert into public.conversation_introductions(sender_id, recipient_id, body, normalized_hash, created_at, expires_at, status)
select target.id, recipient.id,
       'icebreaker fixture ' || recipient.ordinal::text,
       md5(target.id::text || recipient.id::text || recipient.ordinal::text),
       now() - (recipient.ordinal || ' minutes')::interval,
       now() + interval '7 days',
       case recipient.ordinal % 4 when 0 then 'pending' when 1 then 'replied' when 2 then 'declined' else 'expired' end
  from icebreaker_badge_target target
 cross join icebreaker_badge_recipients recipient;
select 'mixed_status_count|' || (select public.icebreaker_introduction_count(id)::text from icebreaker_badge_target);
select 'mixed_status_grade|' || coalesce((select public.icebreaker_grade(id) from icebreaker_badge_target), 'none');
with configured as (
  select id,
         set_config('request.jwt.claim.sub', id::text, false),
         set_config('request.jwt.claim.role', 'authenticated', false)
    from icebreaker_badge_target
)
select 'projected_grade_count|' || (
  select count(*)::text
    from configured c
    cross join lateral public.get_profile_badges(c.id) badges
   where badges.badge_key like 'icebreaker-%'
);
rollback;`;
  const output = execFileSync("docker", ["exec", "-i", LOCAL_DB_CONTAINER, "psql", "-q", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" }).trim().split(/\r?\n/);
  assert.deepEqual(output, [
    "below_bronze|none",
    "exactly_bronze|icebreaker-bronze",
    "below_silver|icebreaker-bronze",
    "exactly_silver|icebreaker-silver",
    "below_gold|icebreaker-silver",
    "exactly_gold|icebreaker-gold",
    "below_platinum|icebreaker-gold",
    "exactly_platinum|icebreaker-platinum",
    "mixed_status_count|10",
    "mixed_status_grade|icebreaker-bronze",
    "projected_grade_count|1",
  ]);
});
