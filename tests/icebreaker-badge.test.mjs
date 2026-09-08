import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20260905320000_icebreaker_badge.sql", root), "utf8");
const badgeComponent = await readFile(new URL("src/lib/profile-badges.ts", root), "utf8");
const hasLocalDatabase = (() => {
  try { execFileSync("docker", ["inspect", "supabase_db_Penpal"], { stdio: "ignore" }); return true; } catch { return false; }
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
create temp table icebreaker_badge_target (id uuid, recipient_id uuid) on commit drop;
insert into icebreaker_badge_target (id, recipient_id)
select target.id, recipient.id
  from public.profiles target
 cross join lateral (
   select p.id
     from public.profiles p
    where p.id <> target.id
      and p.deactivated_at is null
      and p.inactive_mode = false
    order by p.id
    limit 1
 ) recipient
 where target.deactivated_at is null
   and target.inactive_mode = false
   and not exists (select 1 from public.conversation_introductions i where i.sender_id = target.id)
 order by target.id
 limit 1;
insert into public.conversation_introductions(sender_id, recipient_id, body, normalized_hash, created_at, expires_at, status)
select target.id, recipient.id,
       'icebreaker fixture ' || recipient.ordinal::text,
       md5(target.id::text || recipient.id::text || recipient.ordinal::text),
       now() - (recipient.ordinal || ' minutes')::interval,
       now() + interval '7 days',
       case recipient.ordinal % 4 when 0 then 'pending' when 1 then 'replied' when 2 then 'declined' else 'expired' end
  from icebreaker_badge_target target
 cross join lateral (
   select p.id, row_number() over (order by p.id)::integer as ordinal
     from public.profiles p
    where p.id <> target.id
      and p.deactivated_at is null
      and p.inactive_mode = false
      and not exists (
        select 1 from public.conversation_introductions i
         where i.sender_id = target.id and i.recipient_id = p.id
      )
    order by p.id
    limit 10
 ) recipient;
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
  const output = execFileSync("docker", ["exec", "-i", "supabase_db_Penpal", "psql", "-q", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" }).trim().split(/\r?\n/);
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
