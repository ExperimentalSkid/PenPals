import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { LOCAL_DB_CONTAINER } from "./helpers/local-db.mjs";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20260905380000_regional_explorer_badge.sql", root), "utf8");
const badgeComponent = await readFile(new URL("src/lib/profile-badges.ts", root), "utf8");
const hasLocalDatabase = (() => {
  try { execFileSync("docker", ["inspect", LOCAL_DB_CONTAINER], { stdio: "ignore" }); return true; } catch { return false; }
})();

test("Regional Explorer thresholds are centralized and system-derived", () => {
  assert.match(migration, /add column if not exists minimum_regional_regions integer/);
  assert.match(migration, /minimum_regional_regions is null or minimum_regional_regions > 0/);
  assert.match(migration, /'regional-explorer-bronze'[^\n]*true, 79, 10/);
  assert.match(migration, /'regional-explorer-silver'[^\n]*true, 80, 30/);
  assert.match(migration, /'regional-explorer-gold'[^\n]*true, 81, 75/);
  assert.match(migration, /'regional-explorer-platinum'[^\n]*true, 82, 150/);
  assert.match(migration, /regional_explorer_region_count/);
  assert.match(migration, /regional_explorer_grade_for_count/);
  assert.match(migration, /regional_explorer_grade\(target_user uuid\)/);
  assert.match(migration, /create or replace function public\.get_profile_badges/);
  assert.match(migration, /create or replace function public\.admin_get_profile_badges/);
});

test("Regional Explorer uses immutable recipient country/region snapshots from qualifying letters", () => {
  const countStart = migration.indexOf("create or replace function public.regional_explorer_region_count");
  const countEnd = migration.indexOf("revoke all on function public.regional_explorer_region_count", countStart);
  assert.notEqual(countStart, -1);
  assert.notEqual(countEnd, -1);
  const body = migration.slice(countStart, countEnd);
  assert.match(body, /count\(distinct \(l\.recipient_country_code, l\.recipient_region_code\)\)/);
  assert.match(body, /from public\.snail_mail_letters l/);
  assert.match(body, /l\.sender_id = target_user/);
  assert.match(body, /l\.recipient_country_code is not null/);
  assert.match(body, /l\.recipient_region_code is not null/);
  assert.match(body, /l\.delivered_at is not null/);
  assert.match(body, /l\.cancelled_at is null/);
  assert.doesNotMatch(body, /join public\.profiles/);
});

test("all Regional Explorer grades use the shared profile badge component", () => {
  for (const grade of ["bronze", "silver", "gold", "platinum"]) {
    assert.match(badgeComponent, new RegExp(`regional-explorer-${grade}`));
    assert.match(badgeComponent, new RegExp(`Regional Explorer · ${grade[0].toUpperCase()}${grade.slice(1)}`));
  }
  assert.match(badgeComponent, /"regional-explorer"/);
});

test("Regional Explorer boundaries return only the highest grade and deduplicate regions", { skip: !hasLocalDatabase }, () => {
  const sql = `
select 'below_bronze|' || coalesce(public.regional_explorer_grade_for_count(9), 'none');
select 'exactly_bronze|' || coalesce(public.regional_explorer_grade_for_count(10), 'none');
select 'below_silver|' || coalesce(public.regional_explorer_grade_for_count(29), 'none');
select 'exactly_silver|' || coalesce(public.regional_explorer_grade_for_count(30), 'none');
select 'below_gold|' || coalesce(public.regional_explorer_grade_for_count(74), 'none');
select 'exactly_gold|' || coalesce(public.regional_explorer_grade_for_count(75), 'none');
select 'below_platinum|' || coalesce(public.regional_explorer_grade_for_count(149), 'none');
select 'exactly_platinum|' || coalesce(public.regional_explorer_grade_for_count(150), 'none');
begin;
create temp table regional_explorer_badge_target (
  id uuid,
  conversation_id uuid,
  recipient_id uuid
) on commit drop;
with selected as (
  select target.id, recipient.id as recipient_id
    from public.profiles target
   cross join lateral (
     select p.id
       from public.profiles p
      where p.id <> target.id
        and p.allow_snail_mail
        and p.deactivated_at is null
        and p.inactive_mode = false
      order by p.id
      limit 1
   ) recipient
   where target.allow_snail_mail
     and target.deactivated_at is null
     and target.inactive_mode = false
     and not exists (select 1 from public.snail_mail_letters l where l.sender_id = target.id)
   order by target.id
   limit 1
), created as (
  insert into public.conversations (communication_mode)
  select 'snail_mail' from selected
  returning id
)
insert into regional_explorer_badge_target (id, conversation_id, recipient_id)
select selected.id, created.id, selected.recipient_id
  from selected cross join created;
insert into public.snail_mail_letters (
  conversation_id, sender_id, recipient_id, body, sent_at, deliver_at,
  delivered_at, recipient_read_at, recipient_country_code, recipient_region_code,
  client_idempotency_key
)
select t.conversation_id, t.id, t.recipient_id, 'Regional Explorer fixture letter', now(), now(), now(), now(), r.country_code, r.region_code, gen_random_uuid()
  from regional_explorer_badge_target t
 cross join lateral (
   select lr.country_code, lr.region_code
     from public.location_regions lr
    order by lr.country_code, lr.region_code
    limit 10
 ) r
union all
select t.conversation_id, t.id, t.recipient_id, 'Regional Explorer duplicate fixture letter', now(), now(), now(), now(), r.country_code, r.region_code, gen_random_uuid()
  from regional_explorer_badge_target t
 cross join lateral (
   select lr.country_code, lr.region_code
     from public.location_regions lr
    order by lr.country_code, lr.region_code
    limit 1
 ) r;
select 'unique_region_count|' || (select public.regional_explorer_region_count(id)::text from regional_explorer_badge_target);
select 'unique_region_grade|' || coalesce((select public.regional_explorer_grade(id) from regional_explorer_badge_target), 'none');
do $$
begin
  perform set_config('request.jwt.claim.sub', (select id::text from regional_explorer_badge_target), false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
end;
$$;
select 'projected_grade_count|' || (
  select count(*)::text
    from public.get_profile_badges((select id from regional_explorer_badge_target)) badges
   where badges.badge_key like 'regional-explorer-%'
);
rollback;`;
  const output = execFileSync("docker", ["exec", "-i", LOCAL_DB_CONTAINER, "psql", "-q", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" }).trim().split(/\r?\n/);
  assert.deepEqual(output, [
    "below_bronze|none",
    "exactly_bronze|regional-explorer-bronze",
    "below_silver|regional-explorer-bronze",
    "exactly_silver|regional-explorer-silver",
    "below_gold|regional-explorer-silver",
    "exactly_gold|regional-explorer-gold",
    "below_platinum|regional-explorer-gold",
    "exactly_platinum|regional-explorer-platinum",
    "unique_region_count|10",
    "unique_region_grade|regional-explorer-bronze",
    "projected_grade_count|1",
  ]);
});
