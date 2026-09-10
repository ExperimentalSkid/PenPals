import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { LOCAL_DB_CONTAINER } from "./helpers/local-db.mjs";

const root = new URL("../", import.meta.url);
const communicationMigration = await readFile(new URL("supabase/migrations/20260903120000_communication_mode_preferences.sql", root), "utf8");
const lifecycleMigration = await readFile(new URL("supabase/migrations/20260903121000_communication_mode_lifecycle_guard.sql", root), "utf8");
const acceptanceMigration = await readFile(new URL("supabase/migrations/20260904071000_preserve_introduction_response_timestamp.sql", root), "utf8");
const conversationPage = await readFile(new URL("src/app/app/messages/[id]/page.tsx", root), "utf8");
const snailMailPanel = await readFile(new URL("src/app/app/messages/[id]/SnailMailPanel.tsx", root), "utf8");

const hasLocalDatabase = (() => {
  try {
    execFileSync("docker", ["inspect", LOCAL_DB_CONTAINER], { stdio: "ignore" });
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
  assert.match(conversationPage, /const canComposeSnailMail = !pairBlockStateUnavailable && otherCommunicationMode !== "instant" && ownCommunicationMode !== "instant"/);
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
  user_a uuid := gen_random_uuid();
  user_b uuid := gen_random_uuid();
  user_c uuid := gen_random_uuid();
  user_d uuid := gen_random_uuid();
  intro_a uuid;
  intro_b uuid;
  conversation_a uuid;
  conversation_b uuid;
  body text := 'A thoughtful hello about books, travel, and the small details that make conversations memorable.';
  fixture_prefix text := 'im_' || left(replace(gen_random_uuid()::text, '-', ''), 10);
begin
  insert into auth.users(id, email, email_confirmed_at)
    values
      (user_a, user_a::text || '@example.test', now()),
      (user_b, user_b::text || '@example.test', now()),
      (user_c, user_c::text || '@example.test', now()),
      (user_d, user_d::text || '@example.test', now());
  insert into public.profiles(id, username, display_name, birth_date, gender, country, country_code, city, location_precision, bio, quote, looking_for)
    values
      (user_a, fixture_prefix || '_a', 'IM Fixture A', '1990-01-01', 'Not specified', 'NO', 'NO', '', 'country', 'Fixture bio for IM-only testing.', 'A fixture quote.', 'friendship'),
      (user_b, fixture_prefix || '_b', 'IM Fixture B', '1990-01-01', 'Not specified', 'SE', 'SE', '', 'country', 'Fixture bio for IM-only testing.', 'A fixture quote.', 'friendship'),
      (user_c, fixture_prefix || '_c', 'IM Fixture C', '1990-01-01', 'Not specified', 'ES', 'ES', '', 'country', 'Fixture bio for IM-only testing.', 'A fixture quote.', 'friendship'),
      (user_d, fixture_prefix || '_d', 'IM Fixture D', '1990-01-01', 'Not specified', 'DE', 'DE', '', 'country', 'Fixture bio for IM-only testing.', 'A fixture quote.', 'friendship');
  perform set_config('request.jwt.claim.role', 'authenticated', true);
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
  execFileSync("docker", ["exec", "-i", LOCAL_DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: sql, stdio: ["pipe", "ignore", "pipe"] });
});
