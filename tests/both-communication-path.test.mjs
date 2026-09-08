import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const root = new URL("../", import.meta.url);
const relationshipMigration = await readFile(new URL("supabase/migrations/20260904090000_wire_snail_mail_only_relationships.sql", root), "utf8");
const profileView = await readFile(new URL("src/app/app/profile/[username]/ProfileView.tsx", root), "utf8");
const conversationPage = await readFile(new URL("src/app/app/messages/[id]/page.tsx", root), "utf8");
const messagesPage = await readFile(new URL("src/app/app/messages/page.tsx", root), "utf8");

const hasLocalDatabase = (() => {
  try {
    execFileSync("docker", ["inspect", "supabase_db_Penpal"], { stdio: "ignore" });
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
  assert.match(messagesPage, /const instantMemberships = memberships\.filter/);
  assert.match(messagesPage, /Promise\.all\(instantMemberships\.map/);
});

test("live Both relationship establishes IM and can also send Snail Mail", { skip: !hasLocalDatabase }, () => {
  const sql = String.raw`
begin;
do $$
declare
  user_a uuid;
  user_b uuid;
  intro_id uuid;
  new_conversation_id uuid;
  mode text;
  message_count integer;
  letter_count integer;
  intro_body text := 'A thoughtful hello about books, travel, and the small details that make conversations memorable.';
begin
  select p1.id, p2.id
    into user_a, user_b
    from public.profiles p1
    join public.profiles p2 on p2.id <> p1.id
   where p1.deactivated_at is null
     and p2.deactivated_at is null
     and not p1.inactive_mode
     and not p2.inactive_mode
     and not exists (
       select 1 from public.direct_conversation_pairs d
        where d.user_a = least(p1.id, p2.id)
          and d.user_b = greatest(p1.id, p2.id)
     )
     and not exists (
       select 1
         from public.conversation_participants cp
         join public.conversation_participants cp2 on cp2.conversation_id = cp.conversation_id
        where cp.user_id = p1.id and cp2.user_id = p2.id
     )
     and not exists (
       select 1 from public.conversation_introductions i
        where i.sender_id = p1.id and i.recipient_id = p2.id and i.status = 'pending'
     )
     and not exists (
       select 1 from public.snail_mail_letters l
        where (l.sender_id = p1.id and l.recipient_id = p2.id)
           or (l.sender_id = p2.id and l.recipient_id = p1.id)
     )
   limit 1;
  if user_a is null then raise exception 'no isolated active profile pair available'; end if;

  perform set_config('request.jwt.claim.sub', user_a::text, true);
  update public.profiles
     set allow_instant_messages = true,
         allow_snail_mail = true
   where id in (user_a, user_b);
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
  execFileSync("docker", ["exec", "-i", "supabase_db_Penpal", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: sql, stdio: ["pipe", "ignore", "pipe"] });
});
