import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { LOCAL_DB_CONTAINER } from "./helpers/local-db.mjs";

const root = new URL("../", import.meta.url);
const relationshipMigration = await readFile(new URL("supabase/migrations/20260904090000_wire_snail_mail_only_relationships.sql", root), "utf8");
const profileView = await readFile(new URL("src/app/app/profile/[username]/ProfileView.tsx", root), "utf8");
const conversationPage = await readFile(new URL("src/app/app/messages/[id]/page.tsx", root), "utf8");
const messagesPage = await readFile(new URL("src/app/app/messages/page.tsx", root), "utf8");

const hasLocalDatabase = (() => {
  try {
    execFileSync("docker", ["inspect", LOCAL_DB_CONTAINER], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

test("Both profiles expose both communication modes without duplicate actions", () => {
  assert.match(relationshipMigration, /if coalesce\(sender_allow_instant, false\) and coalesce\(recipient_allow_instant, false\) then[\s\S]*relationship_mode := 'instant'/i);
  assert.match(relationshipMigration, /elsif coalesce\(sender_allow_snail, false\) and coalesce\(recipient_allow_snail, false\) then[\s\S]*relationship_mode := 'snail_mail'/i);
  assert.match(profileView, /communicationPreference === "both"[\s\S]*\["Instant Messages", "Snail Mail"\]/);
  assert.match(conversationPage, /const canComposeSnailMail = otherCommunicationMode !== "instant" && ownCommunicationMode !== "instant"/);
  assert.match(conversationPage, /<ConversationThread conversationId=/);
  assert.equal((conversationPage.match(/<SnailMailPanel /g) ?? []).length, 1);
  assert.match(messagesPage, /rpc\("get_instant_message_inbox"\)/);
  assert.match(messagesPage, /Promise\.all\(memberships\.map/);
  assert.match(messagesPage, /rpc\("list_snail_mail"/);
});

test("live Both relationship establishes IM and can also send Snail Mail", { skip: !hasLocalDatabase }, () => {
  const sql = String.raw`
begin;
do $$
declare
  user_a uuid := gen_random_uuid();
  user_b uuid := gen_random_uuid();
  intro_id uuid;
  new_conversation_id uuid;
  mode text;
  message_count integer;
  letter_count integer;
  fixture_prefix text := 'both_' || left(replace(gen_random_uuid()::text, '-', ''), 12);
  intro_body text := 'A thoughtful hello about books, travel, and the small details that make conversations memorable.';
begin
  -- Use isolated, confirmed users so persistent conversations, letters, or
  -- pending introductions in a developer database cannot exhaust the pair
  -- selection before this authorization flow is reached.
  insert into auth.users(id, email, email_confirmed_at)
    values (user_a, user_a::text || '@example.test', now()),
           (user_b, user_b::text || '@example.test', now());
  insert into public.profiles(id, username, display_name, birth_date, gender, country, country_code, city, location_precision, bio, quote, looking_for, allow_instant_messages, allow_snail_mail)
    values
      (user_a, fixture_prefix || '_a', 'Both Fixture A', '1990-01-01', 'Not specified', 'NO', 'NO', '', 'country', 'Fixture sender bio.', 'A fixture quote.', 'friendship', true, true),
      (user_b, fixture_prefix || '_b', 'Both Fixture B', '1990-01-01', 'Not specified', 'NO', 'NO', '', 'country', 'Fixture recipient bio.', 'A fixture quote.', 'friendship', true, true);
  perform set_config('request.jwt.claim.sub', user_a::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  insert into public.conversation_introductions(
    sender_id, recipient_id, body, normalized_hash, icebreaker, expires_at, status
  ) values (
    user_a, user_b, intro_body,
    md5(regexp_replace(lower(intro_body), E'\\s+', ' ', 'g')),
    intro_body, now() + interval '1 day', 'pending'
  ) returning id into intro_id;

  perform set_config('request.jwt.claim.sub', user_b::text, true);
  new_conversation_id := public.reply_to_introduction(
    intro_id,
    'Thanks for the thoughtful note. I would enjoy continuing this conversation in both ways.'
  );
  select c.communication_mode into mode from public.conversations c where c.id = new_conversation_id;
  if mode <> 'instant' then raise exception 'Both relationship did not establish its primary IM channel'; end if;
  if not exists (
    select 1 from public.direct_conversation_pairs d where d.conversation_id = new_conversation_id
  ) then raise exception 'Both relationship did not establish its direct pair'; end if;
  select count(*) into message_count from public.messages m where m.conversation_id = new_conversation_id;
  if message_count <> 2 then raise exception 'Both relationship created an unexpected number of opening messages'; end if;

  -- The established Both relationship can use Snail Mail without creating
  -- another conversation or duplicating the IM relationship.
  perform public.send_snail_mail(
    new_conversation_id,
    'A letter for the slower side of our correspondence.',
    gen_random_uuid()
  );
  select count(*) into letter_count
    from public.snail_mail_letters l
   where l.conversation_id = new_conversation_id
     and l.sender_id = user_b
     and l.recipient_id = user_a;
  if letter_count <> 1 then raise exception 'Both relationship did not create its Snail Mail letter'; end if;

  perform set_config('request.jwt.claim.sub', user_a::text, true);
  insert into public.messages(conversation_id, sender_id, body)
    values (new_conversation_id, user_a, 'The instant side of this Both relationship is still available.');
  select count(*) into message_count from public.messages m where m.conversation_id = new_conversation_id;
  if message_count <> 3 then raise exception 'Both relationship could not continue Instant Messaging'; end if;
  if public.get_public_communication_mode(user_b) <> 'both' then raise exception 'Both preference was not publicly represented'; end if;
end;
$$;
rollback;
`;
  execFileSync("docker", ["exec", "-i", LOCAL_DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: sql, stdio: ["pipe", "ignore", "pipe"] });
});
