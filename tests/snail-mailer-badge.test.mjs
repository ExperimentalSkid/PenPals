import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { LOCAL_DB_CONTAINER } from "./helpers/local-db.mjs";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20260905280000_snail_mailer_badge.sql", root), "utf8");
const lifecycleMigration = await readFile(new URL("supabase/migrations/20260903020000_snail_mail.sql", root), "utf8");
const badgeComponent = await readFile(new URL("src/lib/profile-badges.ts", root), "utf8");
const hasLocalDatabase = (() => {
  try { execFileSync("docker", ["inspect", LOCAL_DB_CONTAINER], { stdio: "ignore" }); return true; } catch { return false; }
})();

test("Snail Mailer thresholds are centralized and system-derived", () => {
  assert.match(migration, /add column if not exists minimum_delivered_letters integer/);
  assert.match(migration, /minimum_delivered_letters is null or minimum_delivered_letters > 0/);
  assert.match(migration, /'snail-mailer-bronze'[^\n]*true, 39, 15/);
  assert.match(migration, /'snail-mailer-silver'[^\n]*true, 40, 30/);
  assert.match(migration, /'snail-mailer-gold'[^\n]*true, 41, 100/);
  assert.match(migration, /'snail-mailer-platinum'[^\n]*true, 42, 250/);
  assert.match(migration, /snail_mailer_delivered_letter_count/);
  assert.match(migration, /snail_mail_letters/);
  assert.match(migration, /snail_mailer_grade_for_count/);
  assert.match(migration, /snail_mailer_grade\(target_user uuid\)/);
  assert.match(migration, /create or replace function public\.get_profile_badges/);
  assert.match(migration, /create or replace function public\.admin_get_profile_badges/);
  assert.match(migration, /public\.snail_mailer_grade\(target_user\)/);
});

test("Snail Mailer uses the delivered terminal lifecycle and deduplicates letter ids", () => {
  const countStart = migration.indexOf("create or replace function public.snail_mailer_delivered_letter_count");
  const countEnd = migration.indexOf("revoke all on function public.snail_mailer_delivered_letter_count", countStart);
  assert.notEqual(countStart, -1);
  assert.notEqual(countEnd, -1);
  const body = migration.slice(countStart, countEnd);
  assert.match(body, /snail_mail_letters/);
  assert.match(body, /l\.sender_id = target_user/);
  assert.match(body, /l\.delivered_at is not null/);
  assert.match(body, /l\.cancelled_at is null/);
  assert.match(body, /count\(distinct l\.id\)/);
  assert.doesNotMatch(body, /auth\.users|activity_rank_events|conversation_introductions/i);
  assert.match(lifecycleMigration, /recipient_read_at is null or delivered_at is not null/);
  assert.match(lifecycleMigration, /delivered_at is not null and l\.recipient_read_at is null/);
  assert.match(migration, /where delivered_at is not null and cancelled_at is null/);
});

test("all Snail Mailer grades use the shared badge component", () => {
  for (const grade of ["bronze", "silver", "gold", "platinum"]) {
    assert.match(badgeComponent, new RegExp(`snail-mailer-${grade}`));
    assert.match(badgeComponent, new RegExp(`Snail Mailer · ${grade[0].toUpperCase()}${grade.slice(1)}`));
  }
  assert.match(badgeComponent, /"snail-mailer"/);
});

test("Snail Mailer boundaries return only the highest qualifying grade and count delivered/read letters once", { skip: !hasLocalDatabase }, () => {
  const sql = `
select 'below_bronze|' || coalesce(public.snail_mailer_grade_for_count(14), 'none');
select 'exactly_bronze|' || coalesce(public.snail_mailer_grade_for_count(15), 'none');
select 'below_silver|' || coalesce(public.snail_mailer_grade_for_count(29), 'none');
select 'exactly_silver|' || coalesce(public.snail_mailer_grade_for_count(30), 'none');
select 'below_gold|' || coalesce(public.snail_mailer_grade_for_count(99), 'none');
select 'exactly_gold|' || coalesce(public.snail_mailer_grade_for_count(100), 'none');
select 'below_platinum|' || coalesce(public.snail_mailer_grade_for_count(249), 'none');
select 'exactly_platinum|' || coalesce(public.snail_mailer_grade_for_count(250), 'none');
select 'above_platinum|' || coalesce(public.snail_mailer_grade_for_count(251), 'none');
begin;
create temp table snail_mailer_badge_target (id uuid, recipient_id uuid, conversation_id uuid) on commit drop;
insert into snail_mailer_badge_target (id, recipient_id, conversation_id)
select sender.id, recipient.id, gen_random_uuid()
  from public.profiles sender
  cross join lateral (
    select p.id
      from public.profiles p
     where p.id <> sender.id
       and p.deactivated_at is null
       and p.inactive_mode = false
       and p.allow_snail_mail
       and not exists (
         select 1 from public.snail_mail_letters l
          where l.sender_id = sender.id and l.recipient_id = p.id
       )
     order by p.id
     limit 1
  ) recipient
 where sender.deactivated_at is null
   and sender.inactive_mode = false
   and sender.allow_snail_mail
   and not exists (select 1 from public.snail_mail_letters l where l.sender_id = sender.id)
 order by sender.id
 limit 1;
insert into public.conversations(id)
select conversation_id from snail_mailer_badge_target;
insert into public.conversation_participants(conversation_id, user_id)
select t.conversation_id, t.id from snail_mailer_badge_target t
union all
select t.conversation_id, t.recipient_id from snail_mailer_badge_target t;
insert into public.snail_mail_letters(
  conversation_id, sender_id, recipient_id, body, sent_at, deliver_at,
  delivered_at, recipient_read_at
)
select t.conversation_id, t.id, t.recipient_id, 'snail mailer badge fixture', now() - interval '2 days', now() - interval '1 day', now() - interval '12 hours', now() - interval '6 hours'
  from snail_mailer_badge_target t;
select 'one_delivered_read|' || (select public.snail_mailer_delivered_letter_count(id)::text from snail_mailer_badge_target);
insert into public.snail_mail_letters(
  conversation_id, sender_id, recipient_id, body, sent_at, deliver_at,
  delivered_at, recipient_read_at
)
select t.conversation_id, t.id, t.recipient_id, 'snail mailer badge fixture ' || g::text,
       now() - make_interval(days => 3 + g), now() - make_interval(days => 2 + g),
       now() - make_interval(days => 1 + g), now() - make_interval(days => 1 + g)
  from snail_mailer_badge_target t
 cross join generate_series(1, 14) as series(g);
select 'actual_fifteen|' || (select public.snail_mailer_delivered_letter_count(id)::text from snail_mailer_badge_target);
insert into public.snail_mail_letters(
  conversation_id, sender_id, recipient_id, body, sent_at, deliver_at
)
select t.conversation_id, t.id, t.recipient_id, 'undelivered fixture', now(), now() + interval '4 days'
  from snail_mailer_badge_target t;
select 'undelivered_ignored|' || (select public.snail_mailer_delivered_letter_count(id)::text from snail_mailer_badge_target);
with configured as (
  select id,
         set_config('request.jwt.claim.sub', id::text, false),
         set_config('request.jwt.claim.role', 'authenticated', false)
    from snail_mailer_badge_target
)
select 'projected_snail_mailer|' || (
  select count(*)::text
    from configured c
    cross join lateral public.get_profile_badges(c.id) badges
   where badges.badge_key like 'snail-mailer-%'
);
with configured as (
  select id,
         set_config('request.jwt.claim.sub', id::text, false),
         set_config('request.jwt.claim.role', 'authenticated', false)
    from snail_mailer_badge_target
)
select 'projected_duplicate_count|' || (
  select count(*)::text
    from configured c
    cross join lateral public.get_profile_badges(c.id) badges
   where badges.badge_key like 'snail-mailer-%'
);
rollback;`;
  const output = execFileSync("docker", ["exec", "-i", LOCAL_DB_CONTAINER, "psql", "-q", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" }).trim().split(/\r?\n/);
  assert.deepEqual(output, [
    "below_bronze|none",
    "exactly_bronze|snail-mailer-bronze",
    "below_silver|snail-mailer-bronze",
    "exactly_silver|snail-mailer-silver",
    "below_gold|snail-mailer-silver",
    "exactly_gold|snail-mailer-gold",
    "below_platinum|snail-mailer-gold",
    "exactly_platinum|snail-mailer-platinum",
    "above_platinum|snail-mailer-platinum",
    "one_delivered_read|1",
    "actual_fifteen|15",
    "undelivered_ignored|15",
    "projected_snail_mailer|1",
    "projected_duplicate_count|1",
  ]);
});
