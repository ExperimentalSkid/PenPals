import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { LOCAL_DB_CONTAINER } from "./helpers/local-db.mjs";

const hasLocalDatabase = (() => {
  try {
    execFileSync("docker", ["inspect", LOCAL_DB_CONTAINER], { stdio: "ignore" });
    return true;
  } catch { return false; }
})();

test("normal message inserts atomically advance conversation activity without moving it backwards", { skip: !hasLocalDatabase }, () => {
  // Privileged fixture setup and ordinary successful inserts only. Everything
  // (including test users and trigger side effects) rolls back on completion.
  const sql = String.raw`
begin;
do $$
declare
  sender uuid := gen_random_uuid();
  recipient uuid := gen_random_uuid();
  conversation uuid;
  activity timestamptz;
  initial_time timestamptz := now() - interval '3 days';
  newest_time timestamptz := now() - interval '1 day';
begin
  insert into auth.users(id, email, email_confirmed_at)
    values (sender, sender::text || '@example.test', now()),
           (recipient, recipient::text || '@example.test', now());
  insert into public.profiles(id, username, display_name, birth_date, gender, country, city)
    values (sender, 'mt_' || left(replace(sender::text, '-', ''), 16), 'Timestamp Sender', '1990-01-01', 'Not specified', 'NO', ''),
           (recipient, 'mt_' || left(replace(recipient::text, '-', ''), 16), 'Timestamp Recipient', '1990-01-01', 'Not specified', 'NO', '');
  insert into public.conversations(created_at, updated_at)
    values (initial_time, initial_time) returning id into conversation;
  insert into public.conversation_participants(conversation_id, user_id)
    values (conversation, sender), (conversation, recipient);
  insert into public.messages(conversation_id, sender_id, body, created_at)
    values (conversation, sender, 'Hello, I enjoyed hearing about your favourite books.', newest_time);
  select updated_at into activity from public.conversations where id = conversation;
  if activity <> newest_time then raise exception 'message insert did not update conversation activity'; end if;

  insert into public.messages(conversation_id, sender_id, body, created_at)
    values (conversation, recipient, 'Thank you for sharing your reading recommendations.', initial_time);
  select updated_at into activity from public.conversations where id = conversation;
  if activity <> newest_time then raise exception 'an older message moved conversation activity backwards'; end if;

  insert into public.messages(conversation_id, sender_id, body, created_at)
    values (conversation, sender, 'I am looking forward to reading your next recommendation.', newest_time + interval '1 hour'),
           (conversation, recipient, 'I have another book to recommend when you are ready.', newest_time + interval '2 hours');
  select updated_at into activity from public.conversations where id = conversation;
  if activity <> newest_time + interval '2 hours' then raise exception 'multi-row insert did not preserve newest activity'; end if;

  if has_function_privilege('authenticated', 'public.touch_message_conversation()', 'execute')
     or has_function_privilege('anon', 'public.touch_message_conversation()', 'execute') then
    raise exception 'trigger function has unnecessary client execute permission';
  end if;
end;
$$;
rollback;
`;
  const output = execFileSync("docker", ["exec", "-i", LOCAL_DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atc", sql], { encoding: "utf8" });
  assert.match(output, /ROLLBACK/);
});
