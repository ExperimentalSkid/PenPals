import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { LOCAL_DB_CONTAINER } from "./helpers/local-db.mjs";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20260905310000_quick_replier_badge.sql", root), "utf8");
const responseStats = await readFile(new URL("supabase/migrations/20260902130000_correctness_discovery_response_identity.sql", root), "utf8");
const badgeComponent = await readFile(new URL("src/lib/profile-badges.ts", root), "utf8");
const hasLocalDatabase = (() => {
  try { execFileSync("docker", ["inspect", LOCAL_DB_CONTAINER], { stdio: "ignore" }); return true; } catch { return false; }
})();

test("Quick Replier thresholds are centralized and system-derived", () => {
  assert.match(migration, /add column if not exists maximum_response_latency_hours numeric/);
  assert.match(migration, /maximum_response_latency_hours is null or maximum_response_latency_hours > 0/);
  assert.match(migration, /'quick-replier-bronze'[^\n]*true, 47, 72, 5/);
  assert.match(migration, /'quick-replier-silver'[^\n]*true, 48, 24, 5/);
  assert.match(migration, /'quick-replier-gold'[^\n]*true, 49, 8, 5/);
  assert.match(migration, /'quick-replier-platinum'[^\n]*true, 50, 2, 5/);
  assert.match(migration, /quick_replier_grade_for_values/);
  assert.match(migration, /quick_replier_average_latency_hours/);
  assert.match(migration, /quick_replier_grade\(target_user uuid\)/);
  assert.match(migration, /public\.get_response_stats\(target_user\)/);
  assert.match(migration, /create or replace function public\.get_profile_badges/);
  assert.match(migration, /create or replace function public\.admin_get_profile_badges/);
});

test("Quick Replier reuses the response population and first-response semantics", () => {
  const statsStart = responseStats.indexOf("create or replace function public.get_response_stats");
  const statsEnd = responseStats.indexOf("revoke all on function public.get_response_stats", statsStart);
  assert.notEqual(statsStart, -1);
  assert.notEqual(statsEnd, -1);
  const statsBody = responseStats.slice(statsStart, statsEnd);
  const latencyStart = migration.indexOf("create or replace function public.quick_replier_average_latency_hours");
  const latencyEnd = migration.indexOf("revoke all on function public.quick_replier_average_latency_hours", latencyStart);
  assert.match(statsBody, /completed >= 5/);
  assert.match(statsBody, /handled_at/);
  assert.match(statsBody, /status = 'expired'/);
  assert.match(migration.slice(latencyStart, latencyEnd), /conversation_introductions/);
  assert.match(migration.slice(latencyStart, latencyEnd), /status in \('replied', 'declined'\)/);
  assert.match(migration.slice(latencyStart, latencyEnd), /handled_at - created_at/);
  assert.match(migration.slice(latencyStart, latencyEnd), /profile_blocks/);
  assert.match(migration.slice(latencyStart, latencyEnd), /reports/);
  assert.match(migration.slice(latencyStart, latencyEnd), /show_response_rate/);
});

test("all Quick Replier grades use the shared profile badge component", () => {
  for (const grade of ["bronze", "silver", "gold", "platinum"]) {
    assert.match(badgeComponent, new RegExp(`quick-replier-${grade}`));
    assert.match(badgeComponent, new RegExp(`Quick Replier · ${grade[0].toUpperCase()}${grade.slice(1)}`));
  }
  assert.match(badgeComponent, /"quick-replier"/);
});

test("Quick Replier boundaries return only the highest grade and respect the minimum sample", { skip: !hasLocalDatabase }, () => {
  const sql = `
select 'exactly_72|' || coalesce(public.quick_replier_grade_for_values(5, 72), 'none');
select 'above_72|' || coalesce(public.quick_replier_grade_for_values(5, 72.1), 'none');
select 'exactly_24|' || coalesce(public.quick_replier_grade_for_values(5, 24), 'none');
select 'above_24|' || coalesce(public.quick_replier_grade_for_values(5, 24.1), 'none');
select 'exactly_8|' || coalesce(public.quick_replier_grade_for_values(5, 8), 'none');
select 'above_8|' || coalesce(public.quick_replier_grade_for_values(5, 8.1), 'none');
select 'exactly_2|' || coalesce(public.quick_replier_grade_for_values(5, 2), 'none');
select 'above_2|' || coalesce(public.quick_replier_grade_for_values(5, 2.1), 'none');
select 'below_sample|' || coalesce(public.quick_replier_grade_for_values(4, 0), 'none');
begin;
create temp table quick_replier_badge_target (id uuid) on commit drop;
create temp table quick_replier_senders (id uuid) on commit drop;
with fixture as (
  select gen_random_uuid() as id, 'qr_' || left(replace(gen_random_uuid()::text, '-', ''), 10) as username
), auth_insert as (
  insert into auth.users(id, email, email_confirmed_at) select id, id::text || '@example.test', now() from fixture returning id
), profile_insert as (
  insert into public.profiles(id, username, display_name, birth_date, gender, country, country_code, city, location_precision, bio, quote, looking_for, show_response_rate)
  select id, username, 'Quick Replier Target', date '1990-01-01', 'Not specified', 'NO', 'NO', '', 'country', 'Fixture bio.', 'Fixture quote.', 'friendship', true from fixture returning id
)
insert into quick_replier_badge_target(id) select id from profile_insert;
with fixtures as (
  select gen_random_uuid() as id, 'qrs_' || left(replace(gen_random_uuid()::text, '-', ''), 8) || '_' || g::text as username from generate_series(1,5) g
), auth_insert as (
  insert into auth.users(id, email, email_confirmed_at) select id, id::text || '@example.test', now() from fixtures returning id
), profile_insert as (
  insert into public.profiles(id, username, display_name, birth_date, gender, country, country_code, city, location_precision, bio, quote, looking_for)
  select id, username, 'Quick Replier Sender', date '1990-01-01', 'Not specified', 'NO', 'NO', '', 'country', 'Fixture bio.', 'Fixture quote.', 'friendship' from fixtures returning id
)
insert into quick_replier_senders(id) select id from profile_insert;
insert into public.conversation_introductions(sender_id, recipient_id, body, normalized_hash, created_at, expires_at, status, handled_at)
select sender.id, target.id, 'quick replier fixture ' || row_number() over (), md5(sender.id::text || target.id::text || random()::text),
       now() - interval '10 days', now() - interval '3 days', 'replied', now() - interval '7 days'
  from quick_replier_badge_target target
 cross join quick_replier_senders sender;
with configured as (
  select id,
         set_config('request.jwt.claim.sub', id::text, false),
         set_config('request.jwt.claim.role', 'authenticated', false)
    from quick_replier_badge_target
)
select 'actual_latency|' || (select round(public.quick_replier_average_latency_hours(c.id), 1)::text from configured c);
with configured as (
  select id,
         set_config('request.jwt.claim.sub', id::text, false),
         set_config('request.jwt.claim.role', 'authenticated', false)
    from quick_replier_badge_target
)
select 'actual_grade|' || coalesce((select public.quick_replier_grade(c.id) from configured c), 'none');
with configured as (
  select id,
         set_config('request.jwt.claim.sub', id::text, false),
         set_config('request.jwt.claim.role', 'authenticated', false)
    from quick_replier_badge_target
)
select 'projected_grade_count|' || (
  select count(*)::text
    from configured c
    cross join lateral public.get_profile_badges(c.id) badges
   where badges.badge_key like 'quick-replier-%'
);
rollback;`;
  const output = execFileSync("docker", ["exec", "-i", LOCAL_DB_CONTAINER, "psql", "-q", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" }).trim().split(/\r?\n/);
  assert.deepEqual(output, [
    "exactly_72|quick-replier-bronze",
    "above_72|none",
    "exactly_24|quick-replier-silver",
    "above_24|quick-replier-bronze",
    "exactly_8|quick-replier-gold",
    "above_8|quick-replier-silver",
    "exactly_2|quick-replier-platinum",
    "above_2|quick-replier-gold",
    "below_sample|none",
    "actual_latency|72.0",
    "actual_grade|quick-replier-bronze",
    "projected_grade_count|1",
  ]);
});
