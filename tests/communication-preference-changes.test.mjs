import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { LOCAL_DB_CONTAINER } from "./helpers/local-db.mjs";

const root = new URL("../", import.meta.url);
const preferencesMigration = await readFile(new URL("supabase/migrations/20260903120000_communication_mode_preferences.sql", root), "utf8");
const relationshipMigration = await readFile(new URL("supabase/migrations/20260904090000_wire_snail_mail_only_relationships.sql", root), "utf8");
const conversationPage = await readFile(new URL("src/app/app/messages/[id]/page.tsx", root), "utf8");

const hasLocalDatabase = (() => {
  try {
    execFileSync("docker", ["inspect", LOCAL_DB_CONTAINER], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

test("preference changes leave established records intact and only gate new sends", () => {
  assert.match(preferencesMigration, /Existing conversations and letters are intentionally left untouched/i);
  assert.match(preferencesMigration, /Existing pairs are not[\s\S]*changed when preferences are edited/i);
  assert.match(preferencesMigration, /Existing conversations and letters are intentionally left untouched/i);
  assert.match(relationshipMigration, /Existing direct pairs remain usable after a preference change/i);
  assert.match(conversationPage, /conversationMode === "snail_mail"/);
  assert.match(conversationPage, /canComposeSnailMail/);
});

test("live preference changes preserve IM history and letters without reopening disabled Snail Mail", { skip: !hasLocalDatabase }, () => {
  const sql = String.raw`
begin;
do $$
declare
  user_a uuid := gen_random_uuid();
  user_b uuid := gen_random_uuid();
  user_c uuid := gen_random_uuid();
  user_d uuid := gen_random_uuid();
  intro_im uuid;
  intro_mail uuid;
  conversation_im uuid;
  conversation_mail uuid;
  mode text;
  message_count integer;
  letter_count integer;
  preserved_body text;
  intro_body text := 'A thoughtful hello about books, travel, and the small details that make conversations memorable.';
  letter_body text := 'A letter sent before the communication preference changed.';
  fixture_prefix text := 'pref_' || left(replace(gen_random_uuid()::text, '-', ''), 10);
begin
  insert into auth.users(id, email, email_confirmed_at)
    values
      (user_a, user_a::text || '@example.test', now()),
      (user_b, user_b::text || '@example.test', now()),
      (user_c, user_c::text || '@example.test', now()),
      (user_d, user_d::text || '@example.test', now());
  insert into public.profiles(id, username, display_name, birth_date, gender, country, country_code, city, location_precision, bio, quote, looking_for)
    values
      (user_a, fixture_prefix || '_a', 'Preference Fixture A', '1990-01-01', 'Not specified', 'NO', 'NO', '', 'country', 'Fixture bio for preference testing.', 'A fixture quote.', 'friendship'),
      (user_b, fixture_prefix || '_b', 'Preference Fixture B', '1990-01-01', 'Not specified', 'SE', 'SE', '', 'country', 'Fixture bio for preference testing.', 'A fixture quote.', 'friendship'),
      (user_c, fixture_prefix || '_c', 'Preference Fixture C', '1990-01-01', 'Not specified', 'ES', 'ES', '', 'country', 'Fixture bio for preference testing.', 'A fixture quote.', 'friendship'),
      (user_d, fixture_prefix || '_d', 'Preference Fixture D', '1990-01-01', 'Not specified', 'DE', 'DE', '', 'country', 'Fixture bio for preference testing.', 'A fixture quote.', 'friendship');
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  -- Establish an IM relationship while both modes are enabled, then post a
  -- letter so both kinds of existing history can be checked after the edit.
  perform set_config('request.jwt.claim.sub', user_a::text, true);
  perform public.save_communication_preferences(true, true);
  perform set_config('request.jwt.claim.sub', user_b::text, true);
  perform public.save_communication_preferences(true, true);
  perform set_config('request.jwt.claim.sub', user_a::text, true);
  insert into public.conversation_introductions(sender_id, recipient_id, body, normalized_hash, icebreaker, expires_at, status)
    values (user_a, user_b, intro_body, md5(regexp_replace(lower(intro_body), E'\\s+', ' ', 'g')), intro_body, now() + interval '1 day', 'pending')
    returning id into intro_im;
  perform set_config('request.jwt.claim.sub', user_b::text, true);
  conversation_im := public.reply_to_introduction(intro_im, 'Thanks for the thoughtful note. I would enjoy continuing this conversation.');
  select c.communication_mode into mode from public.conversations c where c.id = conversation_im;
  if mode <> 'instant' then raise exception 'initial Both relationship was not Instant Messaging'; end if;
  perform public.send_snail_mail(conversation_im, letter_body, gen_random_uuid());

  -- Turning Snail Mail off must not erase the existing letter. IM remains
  -- usable on the established direct pair, but a new letter is rejected.
  perform set_config('request.jwt.claim.sub', user_a::text, true);
  perform public.save_communication_preferences(true, false);
  perform set_config('request.jwt.claim.sub', user_b::text, true);
  perform public.save_communication_preferences(true, false);
  select count(*) into message_count from public.messages m where m.conversation_id = conversation_im;
  if message_count <> 2 then raise exception 'preference change altered existing IM history'; end if;
  select l.body into preserved_body
    from public.snail_mail_letters l
   where l.conversation_id = conversation_im and l.sender_id = user_b and l.recipient_id = user_a;
  if preserved_body <> letter_body then raise exception 'preference change removed an existing letter'; end if;
  perform set_config('request.jwt.claim.sub', user_a::text, true);
  insert into public.messages(conversation_id, sender_id, body)
    values (conversation_im, user_a, 'Existing Instant Messaging remains available after the preference edit.');
  select count(*) into message_count from public.messages m where m.conversation_id = conversation_im;
  if message_count <> 3 then raise exception 'preference change disabled an established IM conversation'; end if;
  begin
    perform public.send_snail_mail(conversation_im, 'This new letter should be rejected after disabling Snail Mail.', gen_random_uuid());
    raise exception 'new Snail Mail unexpectedly succeeded after the preference edit';
  exception when others then
    if sqlerrm <> 'Conversation unavailable' then raise; end if;
  end;

  -- Establish a Snail-Mail-only relationship, then change both users to
  -- Instant Messaging only. The relationship remains mail-only and its first
  -- letter remains durable; preferences do not retrofit a new IM pair.
  perform set_config('request.jwt.claim.sub', user_c::text, true);
  perform public.save_communication_preferences(false, true);
  perform set_config('request.jwt.claim.sub', user_d::text, true);
  perform public.save_communication_preferences(true, true);
  perform set_config('request.jwt.claim.sub', user_c::text, true);
  insert into public.conversation_introductions(sender_id, recipient_id, body, normalized_hash, icebreaker, expires_at, status)
    values (user_c, user_d, intro_body, md5(regexp_replace(lower(intro_body), E'\\s+', ' ', 'g')), intro_body, now() + interval '1 day', 'pending')
    returning id into intro_mail;
  perform set_config('request.jwt.claim.sub', user_d::text, true);
  conversation_mail := public.reply_to_introduction(intro_mail, 'Thanks for the thoughtful note. Let us continue by letter.');
  select c.communication_mode into mode from public.conversations c where c.id = conversation_mail;
  if mode <> 'snail_mail' then raise exception 'initial Snail-Mail relationship had the wrong mode'; end if;
  select count(*) into letter_count from public.snail_mail_letters l where l.conversation_id = conversation_mail;
  if letter_count <> 1 then raise exception 'initial Snail-Mail letter was not created'; end if;

  perform set_config('request.jwt.claim.sub', user_c::text, true);
  perform public.save_communication_preferences(true, false);
  perform set_config('request.jwt.claim.sub', user_d::text, true);
  perform public.save_communication_preferences(true, false);
  select c.communication_mode into mode from public.conversations c where c.id = conversation_mail;
  if mode <> 'snail_mail' then raise exception 'preference change converted an existing Snail-Mail relationship'; end if;
  select count(*) into letter_count from public.snail_mail_letters l where l.conversation_id = conversation_mail;
  if letter_count <> 1 then raise exception 'preference change removed an existing Snail-Mail letter'; end if;
  if exists (select 1 from public.direct_conversation_pairs d where d.conversation_id = conversation_mail) then raise exception 'preference change created an IM pair for existing Snail Mail'; end if;
  perform set_config('request.jwt.claim.sub', user_c::text, true);
  begin
    insert into public.messages(conversation_id, sender_id, body)
      values (conversation_mail, user_c, 'This IM must remain unavailable for an existing mail relationship.');
    raise exception 'IM unexpectedly opened for an existing Snail-Mail relationship';
  exception when others then
    if sqlerrm <> 'Instant Messaging is unavailable for this relationship' then raise; end if;
  end;
end;
$$;
rollback;
`;
  execFileSync("docker", ["exec", "-i", LOCAL_DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: sql, stdio: ["pipe", "ignore", "pipe"] });
});
