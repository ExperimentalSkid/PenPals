import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { LOCAL_DB_CONTAINER } from "./helpers/local-db.mjs";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20260905370000_across_borders_badge.sql", root), "utf8");
const badgeComponent = await readFile(new URL("src/lib/profile-badges.ts", root), "utf8");
const hasLocalDatabase = (() => {
  try { execFileSync("docker", ["inspect", LOCAL_DB_CONTAINER], { stdio: "ignore" }); return true; } catch { return false; }
})();

test("Across Borders thresholds are centralized and system-derived", () => {
  assert.match(migration, /add column if not exists minimum_border_countries integer/);
  assert.match(migration, /minimum_border_countries is null or minimum_border_countries > 0/);
  assert.match(migration, /'across-borders-bronze'[^\n]*true, 75, 5/);
  assert.match(migration, /'across-borders-silver'[^\n]*true, 76, 15/);
  assert.match(migration, /'across-borders-gold'[^\n]*true, 77, 30/);
  assert.match(migration, /'across-borders-platinum'[^\n]*true, 78, 60/);
  assert.match(migration, /across_borders_country_count/);
  assert.match(migration, /across_borders_grade_for_count/);
  assert.match(migration, /across_borders_grade\(target_user uuid\)/);
  assert.match(migration, /create or replace function public\.get_profile_badges/);
  assert.match(migration, /create or replace function public\.admin_get_profile_badges/);
});

test("Across Borders uses immutable recipient-country snapshots from qualifying letters", () => {
  const countStart = migration.indexOf("create or replace function public.across_borders_country_count");
  const countEnd = migration.indexOf("revoke all on function public.across_borders_country_count", countStart);
  assert.notEqual(countStart, -1);
  assert.notEqual(countEnd, -1);
  const body = migration.slice(countStart, countEnd);
  assert.match(body, /count\(distinct l\.recipient_country_code\)/);
  assert.match(body, /from public\.snail_mail_letters l/);
  assert.match(body, /l\.sender_id = target_user/);
  assert.match(body, /l\.recipient_country_code is not null/);
  assert.match(body, /l\.delivered_at is not null/);
  assert.match(body, /l\.cancelled_at is null/);
  assert.doesNotMatch(body, /join public\.profiles/);
});

test("all Across Borders grades use the shared profile badge component", () => {
  for (const grade of ["bronze", "silver", "gold", "platinum"]) {
    assert.match(badgeComponent, new RegExp(`across-borders-${grade}`));
    assert.match(badgeComponent, new RegExp(`Across Borders · ${grade[0].toUpperCase()}${grade.slice(1)}`));
  }
  assert.match(badgeComponent, /"across-borders"/);
});

test("Across Borders boundaries return only the highest grade and deduplicate countries", { skip: !hasLocalDatabase }, () => {
  const sql = `
select 'below_bronze|' || coalesce(public.across_borders_grade_for_count(4), 'none');
select 'exactly_bronze|' || coalesce(public.across_borders_grade_for_count(5), 'none');
select 'below_silver|' || coalesce(public.across_borders_grade_for_count(14), 'none');
select 'exactly_silver|' || coalesce(public.across_borders_grade_for_count(15), 'none');
select 'below_gold|' || coalesce(public.across_borders_grade_for_count(29), 'none');
select 'exactly_gold|' || coalesce(public.across_borders_grade_for_count(30), 'none');
select 'below_platinum|' || coalesce(public.across_borders_grade_for_count(59), 'none');
select 'exactly_platinum|' || coalesce(public.across_borders_grade_for_count(60), 'none');
begin;
create temp table across_borders_badge_target (
  id uuid,
  conversation_id uuid,
  recipient_id uuid
) on commit drop;
with selected as (
  select target.id,
         recipient_a.id as recipient_id
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
   ) recipient_a
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
insert into across_borders_badge_target (id, conversation_id, recipient_id)
select selected.id, created.id, selected.recipient_id
  from selected cross join created;
insert into public.snail_mail_letters (
  conversation_id, sender_id, recipient_id, body, sent_at, deliver_at,
  delivered_at, recipient_read_at, recipient_country_code, client_idempotency_key
)
select t.conversation_id, t.id, rows.recipient_id, 'Across Borders fixture letter', now(), now(), now(), now(), rows.country_code, gen_random_uuid()
  from across_borders_badge_target t
 cross join lateral (
   select t.recipient_id, (select code from public.country_codes order by code limit 1) as country_code
   union all
   select t.recipient_id, (select code from public.country_codes order by code limit 1)
   union all
   select t.recipient_id, (select code from public.country_codes order by code offset 1 limit 1)
   union all
   select t.recipient_id, (select code from public.country_codes order by code offset 1 limit 1)
   union all
   select t.recipient_id, (select code from public.country_codes order by code offset 2 limit 1)
   union all
   select t.recipient_id, (select code from public.country_codes order by code offset 3 limit 1)
   union all
   select t.recipient_id, (select code from public.country_codes order by code offset 4 limit 1)
 ) rows;
select 'unique_country_count|' || (select public.across_borders_country_count(id)::text from across_borders_badge_target);
select 'unique_country_grade|' || coalesce((select public.across_borders_grade(id) from across_borders_badge_target), 'none');
do $$
begin
  perform set_config('request.jwt.claim.sub', (select id::text from across_borders_badge_target), false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
end;
$$;
select 'projected_grade_count|' || (
  select count(*)::text
    from public.get_profile_badges((select id from across_borders_badge_target)) badges
   where badges.badge_key like 'across-borders-%'
);
rollback;`;
  const output = execFileSync("docker", ["exec", "-i", LOCAL_DB_CONTAINER, "psql", "-q", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" }).trim().split(/\r?\n/);
  assert.deepEqual(output, [
    "below_bronze|none",
    "exactly_bronze|across-borders-bronze",
    "below_silver|across-borders-bronze",
    "exactly_silver|across-borders-silver",
    "below_gold|across-borders-silver",
    "exactly_gold|across-borders-gold",
    "below_platinum|across-borders-gold",
    "exactly_platinum|across-borders-platinum",
    "unique_country_count|5",
    "unique_country_grade|across-borders-bronze",
    "projected_grade_count|1",
  ]);
});
