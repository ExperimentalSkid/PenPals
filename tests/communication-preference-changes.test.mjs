import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const root = new URL("../", import.meta.url);
const preferencesMigration = await readFile(new URL("supabase/migrations/20260903120000_communication_mode_preferences.sql", root), "utf8");
const relationshipMigration = await readFile(new URL("supabase/migrations/20260904090000_wire_snail_mail_only_relationships.sql", root), "utf8");
const conversationPage = await readFile(new URL("src/app/app/messages/[id]/page.tsx", root), "utf8");

const hasLocalDatabase = (() => {
  try {
    execFileSync("docker", ["inspect", "supabase_db_Penpal"], { stdio: "ignore" });
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
  user_a uuid;
  user_b uuid;
  user_c uuid;
  user_d uuid;
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
begin
  -- Find two isolated pairs so this test only creates temporary records.
  select p1.id, p2.id, p3.id, p4.id
    into user_a, user_b, user_c, user_d
    from public.profiles p1
    join public.profiles p2 on p2.id <> p1.id
    join public.profiles p3 on p3.id not in (p1.id, p2.id)
    join public.profiles p4 on p4.id not in (p1.id, p2.id, p3.id)
   where p1.deactivated_at is null and p2.deactivated_at is null
     and p1.birth_date <= (current_date - interval '18 years')::date
     and p2.birth_date <= (current_date - interval '18 years')::date
     and p3.birth_date <= (current_date - interval '18 years')::date
     and p4.birth_date <= (current_date - interval '18 years')::date
     and p3.deactivated_at is null and p4.deactivated_at is null
     and not p1.inactive_mode and not p2.inactive_mode
     and not p3.inactive_mode and not p4.inactive_mode
     and not exists (
       select 1 from public.conversation_participants cp
       join public.conversation_participants cp2 on cp2.conversation_id = cp.conversation_id
       where cp.user_id = p1.id and cp2.user_id = p2.id
     )
     and not exists (
       select 1 from public.conversation_participants cp
       join public.conversation_participants cp2 on cp2.conversation_id = cp.conversation_id
       where cp.user_id = p3.id and cp2.user_id = p4.id
     )
     and not exists (
       select 1 from public.snail_mail_letters l
       where (l.sender_id = p1.id and l.recipient_id = p2.id)
          or (l.sender_id = p2.id and l.recipient_id = p1.id)
          or (l.sender_id = p3.id and l.recipient_id = p4.id)
          or (l.sender_id = p4.id and l.recipient_id = p3.id)
     )
     and not exists (select 1 from public.direct_conversation_pairs d where d.user_a = least(p1.id, p2.id) and d.user_b = greatest(p1.id, p2.id))
     and not exists (select 1 from public.direct_conversation_pairs d where d.user_a = least(p3.id, p4.id) and d.user_b = greatest(p3.id, p4.id))
   limit 1;
  if user_a is null then raise exception 'no isolated active profile pairs available'; end if;

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
  execFileSync("docker", ["exec", "-i", "supabase_db_Penpal", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: sql, stdio: ["pipe", "ignore", "pipe"] });
});
