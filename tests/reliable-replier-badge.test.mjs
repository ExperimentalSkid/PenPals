import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20260905290000_reliable_replier_badge.sql", root), "utf8");
const responseStats = await readFile(new URL("supabase/migrations/20260902130000_correctness_discovery_response_identity.sql", root), "utf8");
const responseWindow = await readFile(new URL("supabase/migrations/20260901040000_add_response_rate.sql", root), "utf8");
const badgeComponent = await readFile(new URL("src/lib/profile-badges.ts", root), "utf8");
const hasLocalDatabase = (() => {
  try { execFileSync("docker", ["inspect", "supabase_db_Penpal"], { stdio: "ignore" }); return true; } catch { return false; }
})();

test("Reliable Replier thresholds are centralized and system-derived", () => {
  assert.match(migration, /add column if not exists minimum_response_rate smallint/);
  assert.match(migration, /add column if not exists minimum_completed_opportunities integer/);
  assert.match(migration, /minimum_response_rate is null or minimum_response_rate between 0 and 100/);
  assert.match(migration, /minimum_completed_opportunities is null or minimum_completed_opportunities > 0/);
  assert.match(migration, /'reliable-replier-bronze'[^\n]*true, 31, 70, 5/);
  assert.match(migration, /'reliable-replier-silver'[^\n]*true, 32, 80, 5/);
  assert.match(migration, /'reliable-replier-gold'[^\n]*true, 33, 90, 5/);
  assert.match(migration, /'reliable-replier-platinum'[^\n]*true, 34, 95, 5/);
  assert.match(migration, /reliable_replier_grade_for_values/);
  assert.match(migration, /reliable_replier_grade\(target_user uuid\)/);
  assert.match(migration, /public\.get_response_stats\(target_user\)/);
  assert.match(migration, /create or replace function public\.get_profile_badges/);
  assert.match(migration, /create or replace function public\.admin_get_profile_badges/);
});

test("Reliable Replier preserves the existing sample-size and first-response semantics", () => {
  const statsStart = responseStats.indexOf("create or replace function public.get_response_stats");
  const statsEnd = responseStats.indexOf("revoke all on function public.get_response_stats", statsStart);
  assert.notEqual(statsStart, -1);
  assert.notEqual(statsEnd, -1);
  const body = responseStats.slice(statsStart, statsEnd);
  assert.match(body, /completed >= 5/);
  assert.match(body, /handled_at/);
  assert.match(body, /status = 'expired'/);
  assert.match(responseWindow, /new\.created_at <= created_at \+ interval '7 days'/);
  const gradeStart = migration.indexOf("create or replace function public.reliable_replier_grade_for_values");
  const gradeEnd = migration.indexOf("revoke all on function public.reliable_replier_grade_for_values", gradeStart);
  assert.match(migration.slice(gradeStart, gradeEnd), /completed_opportunities >= d\.minimum_completed_opportunities/);
  assert.match(migration.slice(gradeStart, gradeEnd), /response_rate >= d\.minimum_response_rate/);
});

test("all Reliable Replier grades use the shared badge component", () => {
  for (const grade of ["bronze", "silver", "gold", "platinum"]) {
    assert.match(badgeComponent, new RegExp(`reliable-replier-${grade}`));
    assert.match(badgeComponent, new RegExp(`Reliable Replier · ${grade[0].toUpperCase()}${grade.slice(1)}`));
  }
  assert.match(badgeComponent, /"reliable-replier"/);
});

test("Reliable Replier boundaries return only the highest grade and respect the minimum sample", { skip: !hasLocalDatabase }, () => {
  const sql = `
select 'below_bronze|' || coalesce(public.reliable_replier_grade_for_values(5, 69), 'none');
select 'exactly_bronze|' || coalesce(public.reliable_replier_grade_for_values(5, 70), 'none');
select 'exactly_silver|' || coalesce(public.reliable_replier_grade_for_values(5, 80), 'none');
select 'exactly_gold|' || coalesce(public.reliable_replier_grade_for_values(5, 90), 'none');
select 'exactly_platinum|' || coalesce(public.reliable_replier_grade_for_values(5, 95), 'none');
select 'above_platinum|' || coalesce(public.reliable_replier_grade_for_values(5, 96), 'none');
select 'below_sample|' || coalesce(public.reliable_replier_grade_for_values(4, 100), 'none');
begin;
create temp table reliable_replier_badge_target (id uuid) on commit drop;
insert into reliable_replier_badge_target (id)
select p.id
  from public.profiles p
 where p.show_response_rate
   and p.deactivated_at is null
   and p.inactive_mode = false
   and not exists (select 1 from public.conversation_introductions i where i.recipient_id = p.id)
 order by p.id
 limit 1;
insert into public.conversation_introductions(sender_id, recipient_id, body, normalized_hash, created_at, expires_at, status, handled_at)
select sender.id, target.id, 'reliable replier fixture ' || row_number() over (), md5(sender.id::text || target.id::text || random()::text),
       now() - interval '10 days', now() - interval '3 days',
       case when row_number() over () <= 4 then 'replied' else 'expired' end,
       case when row_number() over () <= 4 then now() - interval '9 days' else null end
  from reliable_replier_badge_target target
 cross join lateral (
    select p.id
      from public.profiles p
     where p.id <> target.id
       and p.deactivated_at is null
       and p.inactive_mode = false
       and not exists (select 1 from public.conversation_introductions i where i.sender_id = p.id and i.recipient_id = target.id)
     order by p.id
     limit 5
 ) sender;
with configured as (
  select id,
         set_config('request.jwt.claim.sub', id::text, false),
         set_config('request.jwt.claim.role', 'authenticated', false)
    from reliable_replier_badge_target
)
select 'actual_stats|' || (select s.completed_opportunities::text || ':' || s.response_rate::text from configured c cross join lateral public.get_response_stats(c.id) s);
with configured as (
  select id,
         set_config('request.jwt.claim.sub', id::text, false),
         set_config('request.jwt.claim.role', 'authenticated', false)
    from reliable_replier_badge_target
)
select 'actual_grade|' || coalesce((select public.reliable_replier_grade(c.id) from configured c), 'none');
with configured as (
  select id,
         set_config('request.jwt.claim.sub', id::text, false),
         set_config('request.jwt.claim.role', 'authenticated', false)
    from reliable_replier_badge_target
)
select 'projected_grade_count|' || (
  select count(*)::text
    from configured c
    cross join lateral public.get_profile_badges(c.id) badges
   where badges.badge_key like 'reliable-replier-%'
);
rollback;`;
  const output = execFileSync("docker", ["exec", "-i", "supabase_db_Penpal", "psql", "-q", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" }).trim().split(/\r?\n/);
  assert.deepEqual(output, [
    "below_bronze|none",
    "exactly_bronze|reliable-replier-bronze",
    "exactly_silver|reliable-replier-silver",
    "exactly_gold|reliable-replier-gold",
    "exactly_platinum|reliable-replier-platinum",
    "above_platinum|reliable-replier-platinum",
    "below_sample|none",
    "actual_stats|5:80",
    "actual_grade|reliable-replier-silver",
    "projected_grade_count|1",
  ]);
});
