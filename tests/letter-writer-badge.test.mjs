import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20260905340000_letter_writer_badge.sql", root), "utf8");
const badgeComponent = await readFile(new URL("src/lib/profile-badges.ts", root), "utf8");
const hasLocalDatabase = (() => {
  try { execFileSync("docker", ["inspect", "supabase_db_Penpal"], { stdio: "ignore" }); return true; } catch { return false; }
})();

test("Letter Writer thresholds are centralized and system-derived", () => {
  assert.match(migration, /add column if not exists minimum_messages_sent integer/);
  assert.match(migration, /minimum_messages_sent is null or minimum_messages_sent > 0/);
  assert.match(migration, /'letter-writer-bronze'[^\n]*true, 63, 100/);
  assert.match(migration, /'letter-writer-silver'[^\n]*true, 64, 500/);
  assert.match(migration, /'letter-writer-gold'[^\n]*true, 65, 2500/);
  assert.match(migration, /'letter-writer-platinum'[^\n]*true, 66, 10000/);
  assert.match(migration, /letter_writer_message_count/);
  assert.match(migration, /letter_writer_grade_for_count/);
  assert.match(migration, /letter_writer_grade\(target_user uuid\)/);
  assert.match(migration, /create or replace function public\.get_profile_badges/);
  assert.match(migration, /create or replace function public\.admin_get_profile_badges/);
});

test("Letter Writer counts message rows only for the target sender and preserves product deletion semantics", () => {
  const countStart = migration.indexOf("create or replace function public.letter_writer_message_count");
  const countEnd = migration.indexOf("revoke all on function public.letter_writer_message_count", countStart);
  assert.notEqual(countStart, -1);
  assert.notEqual(countEnd, -1);
  const body = migration.slice(countStart, countEnd);
  assert.match(body, /count\(\*\)/);
  assert.match(body, /from public\.messages m/);
  assert.match(body, /m\.sender_id = target_user/);
  assert.doesNotMatch(body, /m\.moderation_status/);
  assert.doesNotMatch(body, /recipient_id/);
  assert.match(migration, /messages_sender_idx/);
  assert.match(migration, /sender_id to null/);
});

test("all Letter Writer grades use the shared profile badge component", () => {
  for (const grade of ["bronze", "silver", "gold", "platinum"]) {
    assert.match(badgeComponent, new RegExp(`letter-writer-${grade}`));
    assert.match(badgeComponent, new RegExp(`Letter Writer · ${grade[0].toUpperCase()}${grade.slice(1)}`));
  }
  assert.match(badgeComponent, /"letter-writer"/);
});

test("Letter Writer boundaries return only the highest qualifying grade", { skip: !hasLocalDatabase }, () => {
  const sql = `
select 'below_bronze|' || coalesce(public.letter_writer_grade_for_count(99), 'none');
select 'exactly_bronze|' || coalesce(public.letter_writer_grade_for_count(100), 'none');
select 'below_silver|' || coalesce(public.letter_writer_grade_for_count(499), 'none');
select 'exactly_silver|' || coalesce(public.letter_writer_grade_for_count(500), 'none');
select 'below_gold|' || coalesce(public.letter_writer_grade_for_count(2499), 'none');
select 'exactly_gold|' || coalesce(public.letter_writer_grade_for_count(2500), 'none');
select 'below_platinum|' || coalesce(public.letter_writer_grade_for_count(9999), 'none');
select 'exactly_platinum|' || coalesce(public.letter_writer_grade_for_count(10000), 'none');
begin;
create temp table letter_writer_badge_target (id uuid, recipient_id uuid, conversation_id uuid) on commit drop;
with selected as (
  select target.id, recipient.id as recipient_id
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
     and not exists (select 1 from public.messages m where m.sender_id = target.id)
   order by target.id
   limit 1
), created as (
  insert into public.conversations(communication_mode)
  select 'instant' from selected
  returning id
)
insert into letter_writer_badge_target (id, recipient_id, conversation_id)
select selected.id, selected.recipient_id, created.id
  from selected cross join created;
insert into public.conversation_participants(conversation_id, user_id, last_read_at)
select conversation_id, id, now() from letter_writer_badge_target
union all
select conversation_id, recipient_id, null from letter_writer_badge_target;
insert into public.messages(conversation_id, sender_id, body, created_at)
select target.conversation_id, target.id,
       'letter writer fixture message ' || series.n::text,
       now() - (series.n || ' minutes')::interval
  from letter_writer_badge_target target
 cross join generate_series(1, 100) as series(n);
insert into public.messages(conversation_id, sender_id, body)
select conversation_id, recipient_id, 'incoming fixture message'
  from letter_writer_badge_target;
select 'sent_count|' || (select public.letter_writer_message_count(id)::text from letter_writer_badge_target);
select 'sent_grade|' || coalesce((select public.letter_writer_grade(id) from letter_writer_badge_target), 'none');
do $$
begin
  perform set_config('request.jwt.claim.sub', (select id::text from letter_writer_badge_target), false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
end;
$$;
select 'projected_grade_count|' || (
  select count(*)::text
    from public.get_profile_badges((select id from letter_writer_badge_target)) badges
   where badges.badge_key like 'letter-writer-%'
);
-- Account erasure redacts sender_id rather than deleting the message row; the
-- redacted row must no longer belong to the user for this metric.
update public.messages
   set sender_id = null
 where id = (select id from public.messages where sender_id = (select id from letter_writer_badge_target) order by id limit 1);
select 'after_sender_redaction|' || (select public.letter_writer_message_count(id)::text from letter_writer_badge_target);
rollback;`;
  const output = execFileSync("docker", ["exec", "-i", "supabase_db_Penpal", "psql", "-q", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" }).trim().split(/\r?\n/);
  assert.deepEqual(output, [
    "below_bronze|none",
    "exactly_bronze|letter-writer-bronze",
    "below_silver|letter-writer-bronze",
    "exactly_silver|letter-writer-silver",
    "below_gold|letter-writer-silver",
    "exactly_gold|letter-writer-gold",
    "below_platinum|letter-writer-gold",
    "exactly_platinum|letter-writer-platinum",
    "sent_count|100",
    "sent_grade|letter-writer-bronze",
    "projected_grade_count|1",
    "after_sender_redaction|99",
  ]);
});
