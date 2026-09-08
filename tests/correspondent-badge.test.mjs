import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20260905260000_correspondent_badge.sql", root), "utf8");
const badgeComponent = await readFile(new URL("src/lib/profile-badges.ts", root), "utf8");
const hasLocalDatabase = (() => {
  try { execFileSync("docker", ["inspect", "supabase_db_Penpal"], { stdio: "ignore" }); return true; } catch { return false; }
})();

test("Correspondent thresholds are centralized and system-derived", () => {
  assert.match(migration, /add column if not exists minimum_successful_outgoing integer/);
  assert.match(migration, /minimum_successful_outgoing is null or minimum_successful_outgoing > 0/);
  assert.match(migration, /'correspondent-bronze'[^\n]*true, 27, 10/);
  assert.match(migration, /'correspondent-silver'[^\n]*true, 28, 30/);
  assert.match(migration, /'correspondent-gold'[^\n]*true, 29, 150/);
  assert.match(migration, /'correspondent-platinum'[^\n]*true, 30, 500/);
  assert.match(migration, /correspondent_successful_outgoing_count/);
  assert.match(migration, /conversation_introductions/);
  assert.match(migration, /i\.sender_id = target_user/);
  assert.match(migration, /i\.status in \('accepted', 'replied'\)/);
  assert.match(migration, /count\(distinct coalesce\(i\.conversation_id_legacy, i\.id\)\)/);
  assert.match(migration, /correspondent_grade_for_count/);
  assert.match(migration, /correspondent_grade\(target_user uuid\)/);
  assert.match(migration, /create or replace function public\.get_profile_badges/);
  assert.match(migration, /create or replace function public\.admin_get_profile_badges/);
  assert.match(migration, /public\.correspondent_grade\(target_user\)/);
});

test("the Correspondent metric is scoped to outgoing introduction lifecycle rows", () => {
  const countStart = migration.indexOf("create or replace function public.correspondent_successful_outgoing_count");
  const countEnd = migration.indexOf("revoke all on function public.correspondent_successful_outgoing_count", countStart);
  assert.notEqual(countStart, -1);
  assert.notEqual(countEnd, -1);
  const body = migration.slice(countStart, countEnd);
  assert.match(body, /conversation_introductions/);
  assert.match(body, /i\.sender_id = target_user/);
  assert.match(body, /i\.status in \('accepted', 'replied'\)/);
  assert.doesNotMatch(body, /auth\.users|activity_rank_events|created_at\s*[<>=]/i);
});

test("all Correspondent grades use the shared badge component", () => {
  for (const grade of ["bronze", "silver", "gold", "platinum"]) {
    assert.match(badgeComponent, new RegExp(`correspondent-${grade}`));
    assert.match(badgeComponent, new RegExp(`Correspondent · ${grade[0].toUpperCase()}${grade.slice(1)}`));
  }
  assert.match(badgeComponent, /"correspondent"/);
});

test("Correspondent boundaries return only the highest qualifying grade", { skip: !hasLocalDatabase }, () => {
  const sql = `
select 'below_bronze|' || coalesce(public.correspondent_grade_for_count(9), 'none');
select 'exactly_bronze|' || coalesce(public.correspondent_grade_for_count(10), 'none');
select 'below_silver|' || coalesce(public.correspondent_grade_for_count(29), 'none');
select 'exactly_silver|' || coalesce(public.correspondent_grade_for_count(30), 'none');
select 'below_gold|' || coalesce(public.correspondent_grade_for_count(149), 'none');
select 'exactly_gold|' || coalesce(public.correspondent_grade_for_count(150), 'none');
select 'below_platinum|' || coalesce(public.correspondent_grade_for_count(499), 'none');
select 'exactly_platinum|' || coalesce(public.correspondent_grade_for_count(500), 'none');
select 'above_platinum|' || coalesce(public.correspondent_grade_for_count(501), 'none');
begin;
create temp table correspondent_badge_target (id uuid, recipient_id uuid, conversation_id uuid) on commit drop;
insert into correspondent_badge_target (id, recipient_id)
select sender.id, recipient.id
  from public.profiles sender
  cross join lateral (
    select p.id
      from public.profiles p
     where p.id <> sender.id
       and p.deactivated_at is null
       and p.inactive_mode = false
     order by p.id
     limit 1
  ) recipient
 where sender.deactivated_at is null
   and sender.inactive_mode = false
   and not exists (
     select 1
       from public.conversation_introductions i
      where i.sender_id = sender.id
        and i.status = 'replied'
   )
 order by sender.id
 limit 1;
insert into public.conversation_introductions(sender_id, recipient_id, body, normalized_hash, icebreaker, expires_at, status)
select t.id, t.recipient_id, 'correspondent fixture ' || g::text, md5('correspondent fixture ' || g::text), '', now(), 'replied'
  from correspondent_badge_target t
 cross join generate_series(1, 9) as series(g);
select 'actual_nine|' || (select public.correspondent_successful_outgoing_count(id)::text from correspondent_badge_target);
with created as (insert into public.conversations default values returning id)
update correspondent_badge_target t
   set conversation_id = created.id
  from created;
insert into public.conversation_introductions(sender_id, recipient_id, conversation_id_legacy, body, normalized_hash, icebreaker, expires_at, status)
select t.id, t.recipient_id, t.conversation_id, 'accepted correspondent fixture', md5('accepted correspondent fixture'), '', now(), 'replied'
  from correspondent_badge_target t;
select 'actual_ten|' || (select public.correspondent_successful_outgoing_count(id)::text from correspondent_badge_target);
select 'grade_ten|' || coalesce((select public.correspondent_grade(id) from correspondent_badge_target), 'none');
-- A repeated accepted row for the same conversation is still one success.
insert into public.conversation_introductions(sender_id, recipient_id, conversation_id_legacy, body, normalized_hash, icebreaker, expires_at, status)
select t.id, t.recipient_id, t.conversation_id, 'duplicate accepted correspondent fixture', md5('duplicate accepted correspondent fixture'), '', now(), 'replied'
  from correspondent_badge_target t;
select 'deduped_same_conversation|' || (select public.correspondent_successful_outgoing_count(id)::text from correspondent_badge_target);
-- An accepted incoming introduction must not increase the sender metric.
insert into public.conversation_introductions(sender_id, recipient_id, body, normalized_hash, icebreaker, expires_at, status)
select t.recipient_id, t.id, 'incoming accepted correspondent fixture', md5('incoming accepted correspondent fixture'), '', now(), 'replied'
  from correspondent_badge_target t;
select 'incoming_ignored|' || (select public.correspondent_successful_outgoing_count(id)::text from correspondent_badge_target);
with configured as (
  select id,
         set_config('request.jwt.claim.sub', id::text, false),
         set_config('request.jwt.claim.role', 'authenticated', false)
    from correspondent_badge_target
)
select 'projected_correspondent|' || (
  select count(*)::text
    from configured c
    cross join lateral public.get_profile_badges(c.id) badges
   where badges.badge_key like 'correspondent-%'
);
rollback;`;
  const output = execFileSync("docker", ["exec", "-i", "supabase_db_Penpal", "psql", "-q", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" }).trim().split(/\r?\n/);
  assert.deepEqual(output, [
    "below_bronze|none",
    "exactly_bronze|correspondent-bronze",
    "below_silver|correspondent-bronze",
    "exactly_silver|correspondent-silver",
    "below_gold|correspondent-silver",
    "exactly_gold|correspondent-gold",
    "below_platinum|correspondent-gold",
    "exactly_platinum|correspondent-platinum",
    "above_platinum|correspondent-platinum",
    "actual_nine|9",
    "actual_ten|10",
    "grade_ten|correspondent-bronze",
    "deduped_same_conversation|10",
    "incoming_ignored|10",
    "projected_correspondent|1",
  ]);
});
