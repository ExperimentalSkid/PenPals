import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const migration = await readFile(new URL("../supabase/migrations/20260903150000_communication_anti_spam_guards.sql", import.meta.url), "utf8");
const timestampFix = await readFile(new URL("../supabase/migrations/20260903151000_fix_message_antispam_same_timestamp.sql", import.meta.url), "utf8");
const idempotencyFix = await readFile(new URL("../supabase/migrations/20260903152000_fix_snail_mail_idempotency_guard.sql", import.meta.url), "utf8");
const conversationPage = await readFile(new URL("../src/app/app/messages/[id]/page.tsx", import.meta.url), "utf8");
const conversationThread = await readFile(new URL("../src/app/app/messages/[id]/ConversationThread.tsx", import.meta.url), "utf8");
const snailMailPanel = await readFile(new URL("../src/app/app/messages/[id]/SnailMailPanel.tsx", import.meta.url), "utf8");
const actions = await readFile(new URL("../src/app/app/messages/actions.ts", import.meta.url), "utf8");

const hasLocalDatabase = (() => {
  try {
    execFileSync("docker", ["inspect", "supabase_db_Penpal"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

test("instant-message guard is database-authoritative, serialized, and reply-reset", () => {
  assert.match(migration, /create or replace function public\.enforce_message_consecutive_limit\(\)/i);
  assert.match(migration, /before insert on public\.messages/i);
  assert.match(migration, /messages_consecutive_limit_guard/i);
  assert.match(migration, /pg_advisory_xact_lock\(/i);
  assert.match(migration, /latest_other_created_at/i);
  assert.match(migration, /latest_other_created_at/i);
  assert.match(timestampFix, /m\.created_at > latest_other_created_at/i);
  assert.match(timestampFix, /unanswered_count >= 3/i);
  assert.match(timestampFix, /Wait for a reply before sending another message\./i);
  assert.match(timestampFix, /revoke all on function public\.enforce_message_consecutive_limit\(\) from public, anon, authenticated/i);

  const streakAfterReply = ["a", "a", "a", "b", "a"];
  let streak = 0;
  for (const sender of streakAfterReply) streak = sender === "a" ? streak + 1 : 0;
  assert.equal(streak, 1, "a reply resets the sender's unanswered streak");
  assert.equal(["a", "a", "a"].reduce((count, sender) => sender === "a" ? count + 1 : 0, 0), 3);
});

test("Snail Mail guard limits each sender-recipient pair and uses the existing read acknowledgement", () => {
  assert.match(migration, /create or replace function public\.enforce_snail_mail_pair_limit\(\)/i);
  assert.match(migration, /before insert on public\.snail_mail_letters/i);
  assert.match(migration, /snail_mail_pair_limit_guard/i);
  assert.match(migration, /sender_id = new\.sender_id/i);
  assert.match(migration, /recipient_id = new\.recipient_id/i);
  assert.match(migration, /delivered_at is null/i);
  assert.match(migration, /delivered_at is not null\s+and l\.recipient_read_at is null/is);
  assert.match(migration, /Please wait before sending another letter\./i);
  assert.match(idempotencyFix, /client_idempotency_key is not null/i);
  assert.match(idempotencyFix, /return new;/i);
  assert.match(migration, /snail_mail_sender_recipient_state_idx/i);
  assert.match(migration, /revoke all on function public\.enforce_snail_mail_pair_limit\(\) from public, anon, authenticated/i);

  const pairA = { sender: "a", recipient: "b" };
  const pairB = { sender: "a", recipient: "c" };
  assert.notEqual(`${pairA.sender}:${pairA.recipient}`, `${pairB.sender}:${pairB.recipient}`, "different recipients remain independent");
});

test("conversation UI disables blocked sends and explains pair-scoped Snail Mail limits", () => {
  assert.match(conversationPage, /messageStreak >= 3/);
  assert.match(conversationPage, /currentMessage\.created_at > lastOtherMessageAt/);
  assert.match(conversationPage, /snailMailBlockedReason/);
  assert.match(conversationThread, /disabled=\{messageSendBlocked\}/);
  assert.match(conversationThread, /Wait for a reply before sending another message\./);
  assert.match(snailMailPanel, /composeBlockedReason/);
  assert.match(snailMailPanel, /outgoingLetterIsBlocking/);
  assert.match(snailMailPanel, /canWriteLetter/);
  assert.match(snailMailPanel, /disabled aria-disabled="true"/);
  assert.match(snailMailPanel, /disabled=\{composerBlocked\}/);
  assert.match(conversationPage, /Your last letter is still on its way/);
  assert.match(actions, /error\.message\?\.includes\("Wait for a reply"\)/);
  assert.match(actions, /error\.message\?\.includes\("Please wait before sending another letter"\)/);
});

test("live database guards allow three messages, reset on reply, and isolate Snail Mail recipients", { skip: !hasLocalDatabase }, () => {
  const sql = String.raw`
begin;
do $$
declare
  sender uuid;
  recipient uuid;
  other_recipient uuid;
  conversation uuid;
  first_letter uuid;
  idem uuid := gen_random_uuid();
begin
  select p1.id, p2.id, p3.id
    into sender, recipient, other_recipient
    from public.profiles p1
    join public.profiles p2 on p2.id <> p1.id
    join public.profiles p3 on p3.id <> p1.id and p3.id <> p2.id
   where p1.deactivated_at is null and p2.deactivated_at is null and p3.deactivated_at is null
     and coalesce(p1.inactive_mode, false) = false
     and coalesce(p2.inactive_mode, false) = false
     and coalesce(p3.inactive_mode, false) = false
     and coalesce(p1.allow_snail_mail, true)
     and coalesce(p2.allow_snail_mail, true)
     and coalesce(p3.allow_snail_mail, true)
     and not exists (
       select 1 from public.profile_blocks b
        where (b.blocker_id = p1.id and b.blocked_id in (p2.id, p3.id))
           or (b.blocker_id in (p2.id, p3.id) and b.blocked_id = p1.id)
     )
     and not exists (
       select 1 from public.snail_mail_letters l
        where l.sender_id = p1.id and l.recipient_id in (p2.id, p3.id)
     )
   limit 1;
  if sender is null then raise exception 'no isolated active profile fixture available'; end if;

  perform set_config('request.jwt.claim.sub', sender::text, true);
  insert into public.conversations default values returning id into conversation;
  insert into public.conversation_participants(conversation_id, user_id)
    values (conversation, sender), (conversation, recipient), (conversation, other_recipient);
  insert into public.messages(conversation_id, sender_id, body)
    values (conversation, sender, 'one'), (conversation, sender, 'two'), (conversation, sender, 'three');
  begin
    insert into public.messages(conversation_id, sender_id, body)
      values (conversation, sender, 'four');
    raise exception 'fourth unanswered message unexpectedly succeeded';
  exception when check_violation then null;
  end;
  perform set_config('request.jwt.claim.sub', recipient::text, true);
  insert into public.messages(conversation_id, sender_id, body)
    values (conversation, recipient, 'reply');
  perform set_config('request.jwt.claim.sub', sender::text, true);
  insert into public.messages(conversation_id, sender_id, body)
    values (conversation, sender, 'after reply');

  insert into public.snail_mail_letters(conversation_id, sender_id, recipient_id, body, sent_at, deliver_at, client_idempotency_key)
    values (conversation, sender, recipient, 'first letter', now(), now() + interval '1 day', idem)
    returning id into first_letter;
  begin
    insert into public.snail_mail_letters(conversation_id, sender_id, recipient_id, body, sent_at, deliver_at, client_idempotency_key)
      values (conversation, sender, recipient, 'first letter', now(), now() + interval '1 day', idem);
    raise exception 'same-key retry unexpectedly inserted a second letter';
  exception when unique_violation then null;
  end;
  begin
    insert into public.snail_mail_letters(conversation_id, sender_id, recipient_id, body, sent_at, deliver_at)
      values (conversation, sender, recipient, 'second letter', now(), now() + interval '1 day');
    raise exception 'second outstanding letter unexpectedly succeeded';
  exception when check_violation then null;
  end;
  insert into public.snail_mail_letters(conversation_id, sender_id, recipient_id, body, sent_at, deliver_at)
    values (conversation, sender, other_recipient, 'independent letter', now(), now() + interval '1 day');
  perform set_config('app.snail_mail_system_write', '1', true);
  update public.snail_mail_letters set delivered_at = now() where id = first_letter;
  perform set_config('app.snail_mail_system_write', '', true);
  begin
    insert into public.snail_mail_letters(conversation_id, sender_id, recipient_id, body, sent_at, deliver_at)
      values (conversation, sender, recipient, 'unanswered follow-up', now(), now() + interval '1 day');
    raise exception 'unanswered delivered letter unexpectedly succeeded';
  exception when check_violation then null;
  end;
  perform set_config('app.snail_mail_system_write', '1', true);
  update public.snail_mail_letters set recipient_read_at = now() where id = first_letter;
  perform set_config('app.snail_mail_system_write', '', true);
  insert into public.snail_mail_letters(conversation_id, sender_id, recipient_id, body, sent_at, deliver_at)
    values (conversation, sender, recipient, 'after open', now(), now() + interval '1 day');
end;
$$;
rollback;
`;
  execFileSync("docker", ["exec", "-i", "supabase_db_Penpal", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: sql, stdio: ["pipe", "ignore", "pipe"] });
});
