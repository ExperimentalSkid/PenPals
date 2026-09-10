import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { LOCAL_DB_CONTAINER } from "./helpers/local-db.mjs";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20260904090000_wire_snail_mail_only_relationships.sql", root), "utf8");
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

test("new accepted relationships select Snail Mail without creating an IM pair", () => {
  assert.match(migration, /add column if not exists communication_mode text not null default 'instant'/i);
  assert.match(migration, /communication_mode in \('instant', 'snail_mail'\)/i);
  assert.match(migration, /relationship_mode := 'snail_mail'/i);
  assert.match(migration, /perform public\.send_snail_mail\(existing_conversation_id, body, null\)/i);
  assert.match(migration, /responded_at\)\s*values \(existing_conversation_id, intro\.sender_id, intro\.recipient_id, intro\.created_at, now\(\)\)/i);
  assert.match(migration, /messages_communication_mode_guard/i);
  assert.match(migration, /Instant Messaging is unavailable for this relationship/i);
});

test("Snail Mail-only conversations hide the IM composer and stay out of the IM inbox", () => {
  assert.match(conversationPage, /const conversationModeResult = await db\.from\("conversations"\)\.select\("communication_mode"\)/);
  assert.match(conversationPage, /conversationMode === "snail_mail"/);
  assert.match(conversationPage, /app\.messages\.snailExchange/);
  assert.match(conversationPage, /app\.messages\.snailExchangeBody/);
  assert.match(messagesPage, /rpc\("get_instant_message_inbox"\)/);
  assert.match(messagesPage, /Promise\.all\(memberships\.map/);
});

test("live Snail Mail-only relationships send a delayed first letter and reject IM", { skip: !hasLocalDatabase }, () => {
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
  body_a text := 'A thoughtful hello about books, travel, and the small details that make conversations memorable.';
  body_b text := 'A second thoughtful hello about music, food, and the places that make conversations memorable.';
  letter_body text;
  body_available boolean;
  mode text;
  fixture_prefix text := 'sm_' || left(replace(gen_random_uuid()::text, '-', ''), 10);
begin
  insert into auth.users(id, email, email_confirmed_at)
    values
      (user_a, user_a::text || '@example.test', now()),
      (user_b, user_b::text || '@example.test', now()),
      (user_c, user_c::text || '@example.test', now()),
      (user_d, user_d::text || '@example.test', now());
  insert into public.profiles(id, username, display_name, birth_date, gender, country, country_code, city, location_precision, bio, quote, looking_for)
    values
      (user_a, fixture_prefix || '_a', 'Snail Fixture A', '1990-01-01', 'Not specified', 'NO', 'NO', '', 'country', 'Fixture bio for Snail Mail-only testing.', 'A fixture quote.', 'friendship'),
      (user_b, fixture_prefix || '_b', 'Snail Fixture B', '1990-01-01', 'Not specified', 'SE', 'SE', '', 'country', 'Fixture bio for Snail Mail-only testing.', 'A fixture quote.', 'friendship'),
      (user_c, fixture_prefix || '_c', 'Snail Fixture C', '1990-01-01', 'Not specified', 'ES', 'ES', '', 'country', 'Fixture bio for Snail Mail-only testing.', 'A fixture quote.', 'friendship'),
      (user_d, fixture_prefix || '_d', 'Snail Fixture D', '1990-01-01', 'Not specified', 'DE', 'DE', '', 'country', 'Fixture bio for Snail Mail-only testing.', 'A fixture quote.', 'friendship');
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  -- Pair A: the sender is Snail-Mail-only, the recipient allows both.
  perform set_config('request.jwt.claim.sub', user_a::text, true);
  update public.profiles set allow_instant_messages = false, allow_snail_mail = true where id = user_a;
  update public.profiles set allow_instant_messages = true, allow_snail_mail = true where id = user_b;
  insert into public.conversation_introductions(sender_id, recipient_id, body, normalized_hash, icebreaker, expires_at, status)
    values (user_a, user_b, body_a, md5(regexp_replace(lower(body_a), E'\\s+', ' ', 'g')), body_a, now() + interval '1 day', 'pending')
    returning id into intro_a;
  perform set_config('request.jwt.claim.sub', user_b::text, true);
  conversation_a := public.reply_to_introduction(intro_a, 'Thanks for the thoughtful note. I would enjoy continuing this conversation by letter.');
  select c.communication_mode into mode from public.conversations c where c.id = conversation_a;
  if mode <> 'snail_mail' then raise exception 'Snail-Mail-only acceptance created the wrong relationship mode'; end if;
  if exists (select 1 from public.direct_conversation_pairs d where d.conversation_id = conversation_a) then raise exception 'Snail-Mail-only acceptance created an IM pair'; end if;
  if exists (select 1 from public.messages m where m.conversation_id = conversation_a) then raise exception 'Snail-Mail-only acceptance created IM messages'; end if;
  if not exists (select 1 from public.snail_mail_letters l where l.conversation_id = conversation_a and l.sender_id = user_b and l.recipient_id = user_a and l.deliver_at > l.sent_at) then raise exception 'Snail-Mail-only acceptance did not send a delayed reply letter'; end if;
  if not exists (select 1 from public.response_opportunities o where o.conversation_id = conversation_a and o.responded_at is not null) then raise exception 'Snail-Mail reply did not complete the response opportunity'; end if;
  if not exists (select 1 from public.conversation_introductions i where i.id = intro_a and i.status = 'replied' and i.conversation_id_legacy = conversation_a) then raise exception 'Snail-Mail introduction did not close into its relationship'; end if;

  perform set_config('request.jwt.claim.sub', user_a::text, true);
  select l.body, l.body_available into letter_body, body_available from public.list_snail_mail(conversation_a) l limit 1;
  if body_available or letter_body is not null then raise exception 'Snail-Mail recipient can read the first letter early'; end if;
  begin
    insert into public.messages(conversation_id, sender_id, body) values (conversation_a, user_a, 'This instant message must not be accepted.');
    raise exception 'IM insert unexpectedly succeeded for a Snail-Mail-only relationship';
  exception when others then
    if sqlerrm <> 'Instant Messaging is unavailable for this relationship' then raise; end if;
  end;

  -- Pair B: the sender allows both, the recipient is Snail-Mail-only.
  perform set_config('request.jwt.claim.sub', user_c::text, true);
  update public.profiles set allow_instant_messages = true, allow_snail_mail = true where id = user_c;
  update public.profiles set allow_instant_messages = false, allow_snail_mail = true where id = user_d;
  insert into public.conversation_introductions(sender_id, recipient_id, body, normalized_hash, icebreaker, expires_at, status)
    values (user_c, user_d, body_b, md5(regexp_replace(lower(body_b), E'\\s+', ' ', 'g')), body_b, now() + interval '1 day', 'pending')
    returning id into intro_b;
  perform set_config('request.jwt.claim.sub', user_d::text, true);
  conversation_b := public.reply_to_introduction(intro_b, 'Thanks for the thoughtful note. I would enjoy continuing this conversation by letter.');
  select c.communication_mode into mode from public.conversations c where c.id = conversation_b;
  if mode <> 'snail_mail' then raise exception 'Snail-Mail-only recipient created the wrong relationship mode'; end if;
  if exists (select 1 from public.direct_conversation_pairs d where d.conversation_id = conversation_b) then raise exception 'Snail-Mail-only recipient created an IM pair'; end if;
  if exists (select 1 from public.messages m where m.conversation_id = conversation_b) then raise exception 'Snail-Mail-only recipient created IM messages'; end if;
end;
$$;
rollback;
`;
  execFileSync("docker", ["exec", "-i", LOCAL_DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: sql, stdio: ["pipe", "ignore", "pipe"] });
});
