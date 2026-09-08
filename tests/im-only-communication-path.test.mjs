import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const root = new URL("../", import.meta.url);
const communicationMigration = await readFile(new URL("supabase/migrations/20260903120000_communication_mode_preferences.sql", root), "utf8");
const lifecycleMigration = await readFile(new URL("supabase/migrations/20260903121000_communication_mode_lifecycle_guard.sql", root), "utf8");
const acceptanceMigration = await readFile(new URL("supabase/migrations/20260904071000_preserve_introduction_response_timestamp.sql", root), "utf8");
const conversationPage = await readFile(new URL("src/app/app/messages/[id]/page.tsx", root), "utf8");
const snailMailPanel = await readFile(new URL("src/app/app/messages/[id]/SnailMailPanel.tsx", root), "utf8");

const hasLocalDatabase = (() => {
  try {
    execFileSync("docker", ["inspect", "supabase_db_Penpal"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

test("IM-only users keep the accepted-contact path and lose only the Snail Mail path", () => {
  assert.match(acceptanceMigration, /A reply establishes an instant-message conversation/i);
  assert.match(acceptanceMigration, /id in \(me, intro\.sender_id\)[\s\S]*not allow_instant_messages/i);
  assert.match(acceptanceMigration, /raise exception 'Conversation unavailable'/i);
  assert.match(communicationMigration, /before insert on public\.direct_conversation_pairs/i);
  assert.match(communicationMigration, /not p\.allow_instant_messages/i);
  assert.match(communicationMigration, /before insert on public\.snail_mail_letters/i);
  assert.match(communicationMigration, /not p\.allow_snail_mail/i);
  assert.match(lifecycleMigration, /not p\.allow_instant_messages/i);
});

test("conversation UI keeps IM available while disabling new Snail Mail for instant-only participants", () => {
  assert.match(conversationPage, /const canComposeSnailMail = otherCommunicationMode !== "instant" && ownCommunicationMode !== "instant"/);
  assert.match(conversationPage, /get_public_communication_mode/);
  assert.match(snailMailPanel, /const canWriteLetter = canCompose && !outgoingLetterIsBlocking/);
  assert.match(snailMailPanel, /New letters aren&apos;t available with the current communication preferences/);
  assert.match(snailMailPanel, /disabled aria-disabled="true"/);
});

test("live IM-only contact pairs establish IM in both directions and reject Snail Mail", { skip: !hasLocalDatabase }, () => {
  const sql = String.raw`
begin;
do $$
declare
  user_a uuid;
  user_b uuid;
  user_c uuid;
  user_d uuid;
  intro_a uuid;
  intro_b uuid;
  conversation_a uuid;
  conversation_b uuid;
  body text := 'A thoughtful hello about books, travel, and the small details that make conversations memorable.';
begin
  select p1.id, p2.id, p3.id, p4.id
    into user_a, user_b, user_c, user_d
    from public.profiles p1
    join public.profiles p2 on p2.id <> p1.id
    join public.profiles p3 on p3.id not in (p1.id, p2.id)
    join public.profiles p4 on p4.id not in (p1.id, p2.id, p3.id)
   where p1.deactivated_at is null
     and p1.birth_date <= (current_date - interval '18 years')::date
     and p2.birth_date <= (current_date - interval '18 years')::date
     and p3.birth_date <= (current_date - interval '18 years')::date
     and p4.birth_date <= (current_date - interval '18 years')::date
     and p2.deactivated_at is null
     and p3.deactivated_at is null
     and p4.deactivated_at is null
     and not exists (select 1 from public.direct_conversation_pairs d where d.user_a = least(p1.id, p2.id) and d.user_b = greatest(p1.id, p2.id))
     and not exists (select 1 from public.direct_conversation_pairs d where d.user_a = least(p3.id, p4.id) and d.user_b = greatest(p3.id, p4.id))
     and not exists (select 1 from public.conversation_introductions i where i.sender_id = p1.id and i.recipient_id = p2.id and i.status = 'pending')
     and not exists (select 1 from public.conversation_introductions i where i.sender_id = p3.id and i.recipient_id = p4.id and i.status = 'pending')
   limit 1;
  if user_a is null then raise exception 'no isolated active profile pairs available'; end if;

  -- Pair A: sender is IM-only, recipient accepts both modes.
  perform set_config('request.jwt.claim.sub', user_a::text, true);
  update public.profiles
     set allow_instant_messages = true, allow_snail_mail = false
   where id = user_a;
  update public.profiles
     set allow_instant_messages = true, allow_snail_mail = true
   where id = user_b;
  insert into public.conversation_introductions(sender_id, recipient_id, body, normalized_hash, icebreaker, expires_at, status)
    values (user_a, user_b, body, md5(regexp_replace(lower(body), E'\\s+', ' ', 'g')), body, now() + interval '1 day', 'pending')
    returning id into intro_a;
  perform set_config('request.jwt.claim.sub', user_b::text, true);
  conversation_a := public.reply_to_introduction(intro_a, 'Thanks for the thoughtful note. I would enjoy continuing this conversation with you.');
  if not exists (select 1 from public.conversation_participants cp where cp.conversation_id = conversation_a and cp.user_id in (user_a, user_b) group by cp.conversation_id having count(*) = 2) then
    raise exception 'IM-only sender did not establish a two-user conversation';
  end if;
  perform set_config('request.jwt.claim.sub', user_a::text, true);
  begin
    perform public.send_snail_mail(conversation_a, 'This Snail Mail path must remain unavailable', gen_random_uuid());
    raise exception 'Snail Mail unexpectedly allowed for IM-only sender';
  exception when others then
    if sqlerrm <> 'Conversation unavailable' then raise; end if;
  end;

  -- Pair B: sender accepts both modes, recipient is IM-only.
  perform set_config('request.jwt.claim.sub', user_c::text, true);
  update public.profiles
     set allow_instant_messages = true, allow_snail_mail = true
   where id = user_c;
  update public.profiles
     set allow_instant_messages = true, allow_snail_mail = false
   where id = user_d;
  insert into public.conversation_introductions(sender_id, recipient_id, body, normalized_hash, icebreaker, expires_at, status)
    values (user_c, user_d, body || ' Second exchange.', md5(regexp_replace(lower(body || ' Second exchange.'), E'\\s+', ' ', 'g')), body || ' Second exchange.', now() + interval '1 day', 'pending')
    returning id into intro_b;
  perform set_config('request.jwt.claim.sub', user_d::text, true);
  conversation_b := public.reply_to_introduction(intro_b, 'Thanks for the thoughtful note. I would enjoy continuing this conversation with you.');
  if not exists (select 1 from public.conversation_participants cp where cp.conversation_id = conversation_b and cp.user_id in (user_c, user_d) group by cp.conversation_id having count(*) = 2) then
    raise exception 'IM-only recipient did not establish a two-user conversation';
  end if;
  perform set_config('request.jwt.claim.sub', user_c::text, true);
  begin
    perform public.send_snail_mail(conversation_b, 'This Snail Mail path must remain unavailable', gen_random_uuid());
    raise exception 'Snail Mail unexpectedly allowed for IM-only recipient';
  exception when others then
    if sqlerrm <> 'Conversation unavailable' then raise; end if;
  end;
end;
$$;
rollback;
`;
  execFileSync("docker", ["exec", "-i", "supabase_db_Penpal", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: sql, stdio: ["pipe", "ignore", "pipe"] });
});
