import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20260905390000_mail_reader_badge.sql", root), "utf8");
const badgeComponent = await readFile(new URL("src/lib/profile-badges.ts", root), "utf8");
const hasLocalDatabase = (() => {
  try { execFileSync("docker", ["inspect", "supabase_db_Penpal"], { stdio: "ignore" }); return true; } catch { return false; }
})();

test("Mail Reader thresholds are centralized and system-derived", () => {
  assert.match(migration, /add column if not exists minimum_read_letters integer/);
  assert.match(migration, /minimum_read_letters is null or minimum_read_letters > 0/);
  assert.match(migration, /'mail-reader-bronze'[^\n]*true, 83, 15/);
  assert.match(migration, /'mail-reader-silver'[^\n]*true, 84, 30/);
  assert.match(migration, /'mail-reader-gold'[^\n]*true, 85, 100/);
  assert.match(migration, /'mail-reader-platinum'[^\n]*true, 86, 250/);
  assert.match(migration, /mail_reader_read_letter_count/);
  assert.match(migration, /mail_reader_grade_for_count/);
  assert.match(migration, /mail_reader_grade\(target_user uuid\)/);
  assert.match(migration, /create or replace function public\.get_profile_badges/);
  assert.match(migration, /create or replace function public\.admin_get_profile_badges/);
});

test("Mail Reader counts delivered incoming letters with recipient_read_at", () => {
  const countStart = migration.indexOf("create or replace function public.mail_reader_read_letter_count");
  const countEnd = migration.indexOf("revoke all on function public.mail_reader_read_letter_count", countStart);
  assert.notEqual(countStart, -1);
  assert.notEqual(countEnd, -1);
  const body = migration.slice(countStart, countEnd);
  assert.match(body, /count\(distinct l\.id\)/);
  assert.match(body, /from public\.snail_mail_letters l/);
  assert.match(body, /l\.recipient_id = target_user/);
  assert.match(body, /l\.delivered_at is not null/);
  assert.match(body, /l\.recipient_read_at is not null/);
  assert.match(body, /l\.cancelled_at is null/);
  assert.doesNotMatch(body, /l\.sender_id = target_user/);
});

test("all Mail Reader grades use the shared profile badge component", () => {
  for (const grade of ["bronze", "silver", "gold", "platinum"]) {
    assert.match(badgeComponent, new RegExp(`mail-reader-${grade}`));
    assert.match(badgeComponent, new RegExp(`Mail Reader · ${grade[0].toUpperCase()}${grade.slice(1)}`));
  }
  assert.match(badgeComponent, /icon: "heart", tone: "snail-mailer"/);
});

test("Mail Reader boundaries return only the highest grade and ignore unread incoming letters", { skip: !hasLocalDatabase }, () => {
  const sql = `
select 'below_bronze|' || coalesce(public.mail_reader_grade_for_count(14), 'none');
select 'exactly_bronze|' || coalesce(public.mail_reader_grade_for_count(15), 'none');
select 'below_silver|' || coalesce(public.mail_reader_grade_for_count(29), 'none');
select 'exactly_silver|' || coalesce(public.mail_reader_grade_for_count(30), 'none');
select 'below_gold|' || coalesce(public.mail_reader_grade_for_count(99), 'none');
select 'exactly_gold|' || coalesce(public.mail_reader_grade_for_count(100), 'none');
select 'below_platinum|' || coalesce(public.mail_reader_grade_for_count(249), 'none');
select 'exactly_platinum|' || coalesce(public.mail_reader_grade_for_count(250), 'none');
begin;
create temp table mail_reader_badge_target (
  id uuid,
  conversation_id uuid,
  sender_id uuid
) on commit drop;
with selected as (
  select target.id, sender.id as sender_id
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
   ) sender
   where target.allow_snail_mail
     and target.deactivated_at is null
     and target.inactive_mode = false
     and not exists (select 1 from public.snail_mail_letters l where l.recipient_id = target.id)
   order by target.id
   limit 1
), created as (
  insert into public.conversations (communication_mode)
  select 'snail_mail' from selected
  returning id
)
insert into mail_reader_badge_target (id, conversation_id, sender_id)
select selected.id, created.id, selected.sender_id
  from selected cross join created;
insert into public.snail_mail_letters (
  conversation_id, sender_id, recipient_id, body, sent_at, deliver_at,
  delivered_at, recipient_read_at, client_idempotency_key
)
select t.conversation_id, t.sender_id, t.id, 'Mail Reader fixture letter', now(), now(), now(), now(), gen_random_uuid()
  from mail_reader_badge_target t
 cross join generate_series(1, 15) as series(n)
union all
select t.conversation_id, t.sender_id, t.id, 'Mail Reader unread fixture letter', now(), now(), now(), null, gen_random_uuid()
  from mail_reader_badge_target t;
select 'read_count|' || (select public.mail_reader_read_letter_count(id)::text from mail_reader_badge_target);
select 'read_grade|' || coalesce((select public.mail_reader_grade(id) from mail_reader_badge_target), 'none');
do $$
begin
  perform set_config('request.jwt.claim.sub', (select id::text from mail_reader_badge_target), false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
end;
$$;
select 'projected_grade_count|' || (
  select count(*)::text
    from public.get_profile_badges((select id from mail_reader_badge_target)) badges
   where badges.badge_key like 'mail-reader-%'
);
rollback;`;
  const output = execFileSync("docker", ["exec", "-i", "supabase_db_Penpal", "psql", "-q", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" }).trim().split(/\r?\n/);
  assert.deepEqual(output, [
    "below_bronze|none",
    "exactly_bronze|mail-reader-bronze",
    "below_silver|mail-reader-bronze",
    "exactly_silver|mail-reader-silver",
    "below_gold|mail-reader-silver",
    "exactly_gold|mail-reader-gold",
    "below_platinum|mail-reader-gold",
    "exactly_platinum|mail-reader-platinum",
    "read_count|15",
    "read_grade|mail-reader-bronze",
    "projected_grade_count|1",
  ]);
});
