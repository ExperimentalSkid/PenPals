import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { LOCAL_DB_CONTAINER } from "./helpers/local-db.mjs";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20260905330000_conversation_starter_badge.sql", root), "utf8");
const badgeComponent = await readFile(new URL("src/lib/profile-badges.ts", root), "utf8");
const hasLocalDatabase = (() => {
  try { execFileSync("docker", ["inspect", LOCAL_DB_CONTAINER], { stdio: "ignore" }); return true; } catch { return false; }
})();

test("Conversation Starter thresholds are centralized and system-derived", () => {
  assert.match(migration, /add column if not exists minimum_conversations_started integer/);
  assert.match(migration, /minimum_conversations_started is null or minimum_conversations_started > 0/);
  assert.match(migration, /'conversation-starter-bronze'[^\n]*true, 55, 10/);
  assert.match(migration, /'conversation-starter-silver'[^\n]*true, 56, 50/);
  assert.match(migration, /'conversation-starter-gold'[^\n]*true, 57, 200/);
  assert.match(migration, /'conversation-starter-platinum'[^\n]*true, 58, 500/);
  assert.match(migration, /conversation_starter_count/);
  assert.match(migration, /conversation_starter_grade_for_count/);
  assert.match(migration, /conversation_starter_grade\(target_user uuid\)/);
  assert.match(migration, /create or replace function public\.get_profile_badges/);
  assert.match(migration, /create or replace function public\.admin_get_profile_badges/);
});

test("Conversation Starter counts distinct server-recorded initiator conversations", () => {
  const countStart = migration.indexOf("create or replace function public.conversation_starter_count");
  const countEnd = migration.indexOf("revoke all on function public.conversation_starter_count", countStart);
  assert.notEqual(countStart, -1);
  assert.notEqual(countEnd, -1);
  const body = migration.slice(countStart, countEnd);
  assert.match(body, /count\(distinct o\.conversation_id\)/);
  assert.match(body, /response_opportunities o/);
  assert.match(body, /o\.initiator_id = target_user/);
  assert.match(body, /join public\.conversations c on c\.id = o\.conversation_id/);
  assert.doesNotMatch(body, /o\.recipient_id = target_user/);
  assert.doesNotMatch(body, /status/);
});

test("all Conversation Starter grades use the shared profile badge component", () => {
  for (const grade of ["bronze", "silver", "gold", "platinum"]) {
    assert.match(badgeComponent, new RegExp(`conversation-starter-${grade}`));
    assert.match(badgeComponent, new RegExp(`Conversation Starter · ${grade[0].toUpperCase()}${grade.slice(1)}`));
  }
  assert.match(badgeComponent, /"conversation-starter"/);
});

test("Conversation Starter boundaries return only the highest grade and deduplicate conversations", { skip: !hasLocalDatabase }, () => {
  const sql = `
select 'below_bronze|' || coalesce(public.conversation_starter_grade_for_count(9), 'none');
select 'exactly_bronze|' || coalesce(public.conversation_starter_grade_for_count(10), 'none');
select 'below_silver|' || coalesce(public.conversation_starter_grade_for_count(49), 'none');
select 'exactly_silver|' || coalesce(public.conversation_starter_grade_for_count(50), 'none');
select 'below_gold|' || coalesce(public.conversation_starter_grade_for_count(199), 'none');
select 'exactly_gold|' || coalesce(public.conversation_starter_grade_for_count(200), 'none');
select 'below_platinum|' || coalesce(public.conversation_starter_grade_for_count(499), 'none');
select 'exactly_platinum|' || coalesce(public.conversation_starter_grade_for_count(500), 'none');
begin;
create temp table conversation_starter_badge_target (id uuid, recipient_id uuid) on commit drop;
insert into conversation_starter_badge_target (id, recipient_id)
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
   and not exists (select 1 from public.response_opportunities o where o.initiator_id = target.id)
 order by target.id
 limit 1;
with target as (
  select id, recipient_id from conversation_starter_badge_target
), created as (
  insert into public.conversations(communication_mode)
  select 'instant' from generate_series(1, 10)
  returning id
)
insert into public.response_opportunities(conversation_id, initiator_id, recipient_id)
select c.id, target.id, target.recipient_id
  from created c
 cross join target;
-- A response opportunity is one row per conversation. These extra
-- introduction rows represent the same conversation and must not inflate it.
insert into public.conversation_introductions(sender_id, recipient_id, conversation_id_legacy, body, normalized_hash, icebreaker, expires_at, status)
select target.id, target.recipient_id, o.conversation_id,
       'conversation starter fixture', md5(o.conversation_id::text || target.id::text), '', now() + interval '7 days', 'replied'
  from conversation_starter_badge_target target
  cross join lateral (
    select conversation_id from public.response_opportunities
     where initiator_id = target.id
     order by conversation_id
     limit 1
  ) o;
select 'started_count|' || (select public.conversation_starter_count(id)::text from conversation_starter_badge_target);
select 'started_grade|' || coalesce((select public.conversation_starter_grade(id) from conversation_starter_badge_target), 'none');
with target as (
  select id, recipient_id from conversation_starter_badge_target
), inbound as (
  insert into public.conversations(communication_mode)
  values ('instant')
  returning id
)
insert into public.response_opportunities(conversation_id, initiator_id, recipient_id)
select inbound.id, target.recipient_id, target.id
  from inbound cross join target;
select 'after_incoming_count|' || (select public.conversation_starter_count(id)::text from conversation_starter_badge_target);
with configured as (
  select id,
         set_config('request.jwt.claim.sub', id::text, false),
         set_config('request.jwt.claim.role', 'authenticated', false)
    from conversation_starter_badge_target
)
select 'projected_grade_count|' || (
  select count(*)::text
    from configured c
    cross join lateral public.get_profile_badges(c.id) badges
   where badges.badge_key like 'conversation-starter-%'
);
rollback;`;
  const output = execFileSync("docker", ["exec", "-i", LOCAL_DB_CONTAINER, "psql", "-q", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" }).trim().split(/\r?\n/);
  assert.deepEqual(output, [
    "below_bronze|none",
    "exactly_bronze|conversation-starter-bronze",
    "below_silver|conversation-starter-bronze",
    "exactly_silver|conversation-starter-silver",
    "below_gold|conversation-starter-silver",
    "exactly_gold|conversation-starter-gold",
    "below_platinum|conversation-starter-gold",
    "exactly_platinum|conversation-starter-platinum",
    "started_count|10",
    "started_grade|conversation-starter-bronze",
    "after_incoming_count|10",
    "projected_grade_count|1",
  ]);
});
