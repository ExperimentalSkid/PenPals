import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20260903180000_cancel_snail_mail.sql", root), "utf8");
const readHardeningMigration = await readFile(new URL("supabase/migrations/20260903181000_harden_cancelled_snail_mail_read.sql", root), "utf8");
const lifecycleMigration = await readFile(new URL("supabase/migrations/20260903182000_restrict_snail_mail_cancel_lifecycle.sql", root), "utf8");
const actions = await readFile(new URL("src/app/app/messages/actions.ts", root), "utf8");
const panel = await readFile(new URL("src/app/app/messages/[id]/SnailMailPanel.tsx", root), "utf8");
const inbox = await readFile(new URL("src/app/app/messages/page.tsx", root), "utf8");
const conversation = await readFile(new URL("src/app/app/messages/[id]/page.tsx", root), "utf8");
const story = await readFile(new URL("src/app/app/messages/snailMailStory.ts", root), "utf8");

const hasLocalDatabase = (() => {
  try {
    execFileSync("docker", ["inspect", "supabase_db_Penpal"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

test("cancellation adds a server-managed state and sender-only RPC", () => {
  assert.match(migration, /add column if not exists cancelled_at timestamptz/i);
  assert.match(migration, /snail_mail_cancelled_before_delivery/i);
  assert.match(migration, /new\.cancelled_at is distinct from old\.cancelled_at/i);
  assert.match(migration, /Snail Mail cancellation is server-managed/i);
  assert.match(migration, /create or replace function public\.cancel_snail_mail\(letter_id uuid\)/i);
  assert.match(migration, /l\.sender_id = me/i);
  assert.match(migration, /for update/i);
  assert.match(migration, /letter_row\.deliver_at <= now\(\)/i);
  assert.match(migration, /grant execute on function public\.cancel_snail_mail\(uuid\) to authenticated/i);
  assert.match(migration, /revoke all on function public\.cancel_snail_mail\(uuid\) from public, anon/i);
  assert.match(lifecycleMigration, /p\.deactivated_at is not null/i);
  assert.match(lifecycleMigration, /cancel_snail_mail\(letter_id uuid\)/i);
});

test("cancelled letters cannot be delivered or used to bypass pair limits", () => {
  assert.match(migration, /l\.cancelled_at is null\s+and l\.deliver_at <= now\(\)/is);
  assert.match(migration, /l\.cancelled_at is null\s+and l\.delivered_at is null/is);
  assert.match(migration, /l\.cancelled_at is null\s+and l\.delivered_at is not null/is);
  assert.match(migration, /set cancelled_at = now\(\)/i);
  assert.match(migration, /where l\.id = due\.id[\s\S]*l\.cancelled_at is null/i);
  assert.match(readHardeningMigration, /revoke all on table public\.snail_mail_letters from public, anon, authenticated/i);
  assert.match(readHardeningMigration, /l\.cancelled_at is null[\s\S]*l\.deliver_at <= now\(\)/i);
});

test("recipient masking and shared lost-in-transit story are wired through both views", () => {
  assert.match(migration, /case when l\.sender_id = me[\s\S]*l\.cancelled_at is null[\s\S]*then l\.body else null end/is);
  assert.match(migration, /case when l\.cancelled_at is not null then 'lost_in_transit'/i);
  assert.match(panel, /cancelSnailMail/);
  assert.match(actions, /export async function cancelSnailMail/);
  assert.match(panel, /window\.confirm\(/);
  assert.match(panel, /Cancel letter/);
  assert.match(panel, /Lost in transit/);
  assert.match(panel, /This letter was lost before it reached you/);
  assert.match(inbox, /isLostInTransit/);
  assert.match(inbox, /lostInTransitCopy/);
  assert.match(inbox, /Lost in transit/);
  assert.match(conversation, /isLostInTransit/);
  assert.match(story, /lostInTransitCopy/);
  assert.match(story, /story_variant/);
});

test("live cancellation preserves sender body, masks recipient body, and releases the pair", { skip: !hasLocalDatabase }, () => {
  const sql = String.raw`
begin;
do $$
declare
  sender uuid;
  recipient uuid;
  conversation uuid;
  first_letter uuid;
  second_letter uuid;
  sender_row record;
  recipient_row record;
begin
  select p1.id, p2.id
    into sender, recipient
    from public.profiles p1
    join auth.users a1 on a1.id = p1.id and a1.email_confirmed_at is not null
    join public.profiles p2 on p2.id <> p1.id
    join auth.users a2 on a2.id = p2.id and a2.email_confirmed_at is not null
   where p1.deactivated_at is null and p2.deactivated_at is null
     and coalesce(p1.inactive_mode, false) = false
     and coalesce(p2.inactive_mode, false) = false
     and coalesce(p1.allow_snail_mail, true)
     and coalesce(p2.allow_snail_mail, true)
     and not exists (
       select 1 from public.profile_blocks b
        where (b.blocker_id = p1.id and b.blocked_id = p2.id)
           or (b.blocker_id = p2.id and b.blocked_id = p1.id)
     )
     and not exists (
       select 1 from public.snail_mail_letters l
        where l.sender_id = p1.id and l.recipient_id = p2.id
     )
   limit 1;
  if sender is null then raise exception 'no isolated verified profile pair available'; end if;

  insert into public.conversations default values returning id into conversation;
  insert into public.conversation_participants(conversation_id, user_id)
    values (conversation, sender), (conversation, recipient);
  insert into public.snail_mail_letters(
    conversation_id, sender_id, recipient_id, body, sent_at, deliver_at,
    client_idempotency_key, transport_mode, distance_band, base_delivery_hours,
    transport_multiplier, story_seed, story_variant
  ) values (
    conversation, sender, recipient, 'private cancellation test', now(), now() + interval '1 day',
    gen_random_uuid(), 'standard', 'long_distance', 96, 1.00, 123, 1
  ) returning id into first_letter;

  perform set_config('request.jwt.claim.sub', sender::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform public.cancel_snail_mail(first_letter);
  select * into sender_row from public.list_snail_mail(conversation) where id = first_letter;
  if sender_row.letter_status <> 'lost_in_transit' or sender_row.body <> 'private cancellation test' or not sender_row.body_available then
    raise exception 'sender did not retain the cancelled letter body';
  end if;

  perform set_config('request.jwt.claim.sub', recipient::text, true);
  select * into recipient_row from public.list_snail_mail(conversation) where id = first_letter;
  if recipient_row.letter_status <> 'lost_in_transit' or recipient_row.body is not null or recipient_row.body_available or recipient_row.unread then
    raise exception 'recipient received cancelled letter details';
  end if;
  begin
    perform public.cancel_snail_mail(first_letter);
    raise exception 'recipient cancelled a sender-owned letter';
  exception when others then
    if sqlerrm = 'recipient cancelled a sender-owned letter' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', sender::text, true);
  insert into public.snail_mail_letters(
    conversation_id, sender_id, recipient_id, body, sent_at, deliver_at,
    client_idempotency_key, transport_mode, distance_band, base_delivery_hours,
    transport_multiplier, story_seed, story_variant
  ) values (
    conversation, sender, recipient, 'follow-up after loss', now(), now() + interval '1 day',
    gen_random_uuid(), 'standard', 'long_distance', 96, 1.00, 456, 2
  ) returning id into second_letter;
  perform set_config('app.snail_mail_system_write', '1', true);
  update public.snail_mail_letters set delivered_at = now(), recipient_read_at = now() where id = second_letter;
  perform set_config('app.snail_mail_system_write', '', true);
  begin
    perform public.cancel_snail_mail(second_letter);
    raise exception 'delivered letter was cancelled';
  exception when others then
    if sqlerrm = 'delivered letter was cancelled' then raise; end if;
  end;
end;
$$;
rollback;
`;
  execFileSync("docker", ["exec", "-i", "supabase_db_Penpal", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: sql, stdio: ["pipe", "ignore", "pipe"] });
});
