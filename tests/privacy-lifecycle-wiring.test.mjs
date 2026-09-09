import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20260904160000_close_deactivated_photo_viewer_bypass.sql", root), "utf8");
const pauseMailMigration = await readFile(new URL("supabase/migrations/20260904161000_allow_paused_snail_mail_read.sql", root), "utf8");
const blockMigration = await readFile(new URL("supabase/migrations/20260904162000_require_active_block_mutations.sql", root), "utf8");

test("private-photo authorization requires an active viewer while keeping Pause separate", () => {
  assert.match(migration, /viewer_profile\.deactivated_at is null/);
  assert.doesNotMatch(migration, /viewer_profile\.inactive_mode\s+is\s+false/);
  assert.match(migration, /owner_profile\.deactivated_at is null/);
  assert.match(migration, /profile_blocks/);
});

test("paused users retain read access to existing Snail Mail while deactivation remains denied", () => {
  assert.match(pauseMailMigration, /p\.deactivated_at is not null/);
  assert.doesNotMatch(pauseMailMigration, /p\.inactive_mode\s+\)/);
  assert.match(pauseMailMigration, /recipient_read_at = coalesce\(recipient_read_at, now\(\)\)/);
});

test("deactivation closes direct block-list mutations without conflating Pause", () => {
  assert.match(blockMigration, /p\.deactivated_at is null/);
  assert.doesNotMatch(blockMigration, /p\.inactive_mode\s+is\s+false/);
  assert.match(blockMigration, /with check/);
});

const hasLocalDatabase = (() => {
  try {
    execFileSync("docker", ["inspect", "supabase_db_Penpal"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

test("a deactivated viewer cannot bypass private-photo access through the RPC", { skip: !hasLocalDatabase }, () => {
  const sql = String.raw`
begin;
do $$
declare
  owner_user uuid;
  viewer_user uuid;
  owner_path text;
  active_result boolean;
  deactivated_result boolean;
begin
  select p.id into owner_user
    from public.profiles p
   where p.role = 'user'
     and p.deactivated_at is null
     and not p.inactive_mode
     and exists (select 1 from auth.users u where u.id = p.id and u.email_confirmed_at is not null)
   order by p.created_at
   limit 1;
  select p.id into viewer_user
    from public.profiles p
   where p.role = 'user'
     and p.id <> owner_user
     and p.deactivated_at is null
     and not p.inactive_mode
     and exists (select 1 from auth.users u where u.id = p.id and u.email_confirmed_at is not null)
   order by p.created_at
   limit 1;
  if owner_user is null or viewer_user is null then
    raise exception 'verified user fixtures unavailable';
  end if;

  owner_path := owner_user::text || '/lifecycle-photo-test.png';
  perform set_config('app.allow_account_status_change', '1', true);
  perform set_config('request.jwt.claim.sub', owner_user::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  update public.profiles set avatar_path = owner_path where id = owner_user;
  insert into public.profile_photo_access_grants(owner_id, viewer_id)
    values (owner_user, viewer_user)
    on conflict do nothing;

  perform set_config('request.jwt.claim.sub', viewer_user::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  select public.can_view_profile_photo(owner_user, viewer_user) into active_result;
  if not active_result then
    raise exception 'active viewer lost private-photo access';
  end if;

  perform set_config('app.allow_account_status_change', '1', true);
  update public.profiles set deactivated_at = now() where id = viewer_user;
  select public.can_view_profile_photo(owner_user, viewer_user) into deactivated_result;
  if deactivated_result then
    raise exception 'deactivated viewer bypassed private-photo access';
  end if;
end;
$$;
rollback;
`;
  execFileSync("docker", ["exec", "-i", "supabase_db_Penpal", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: sql, stdio: ["pipe", "ignore", "pipe"] });
});

test("a paused recipient can open an existing delivered Snail Mail letter", { skip: !hasLocalDatabase }, () => {
  // Do not depend on an incidental cancelled letter from another test or a
  // developer's data. Build a delivered letter in a real temporary
  // conversation, then exercise the recipient's paused read path.
  const sql = String.raw`
begin;
do $$
declare
  sender_user uuid := gen_random_uuid();
  recipient_user uuid := gen_random_uuid();
  letter_id uuid;
  conversation_id uuid;
  read_at timestamptz;
  fixture_prefix text := 'pm_' || left(replace(gen_random_uuid()::text, '-', ''), 12);
begin
  insert into auth.users(id, email, email_confirmed_at)
    values (sender_user, sender_user::text || '@example.test', now()),
           (recipient_user, recipient_user::text || '@example.test', now());
  insert into public.profiles(id, username, display_name, birth_date, gender, country, country_code, city, location_precision, bio, quote, looking_for)
    values
      (sender_user, fixture_prefix || '_s', 'Pause Mail Sender', '1990-01-01', 'Not specified', 'NO', 'NO', '', 'country', 'Fixture sender bio.', 'A fixture quote.', 'friendship'),
      (recipient_user, fixture_prefix || '_r', 'Pause Mail Recipient', '1990-01-01', 'Not specified', 'NO', 'NO', '', 'country', 'Fixture recipient bio.', 'A fixture quote.', 'friendship');
  insert into public.conversations(communication_mode) values ('instant') returning id into conversation_id;
  insert into public.conversation_participants(conversation_id, user_id)
    values (conversation_id, sender_user), (conversation_id, recipient_user);
  insert into public.snail_mail_letters(conversation_id,sender_id,recipient_id,body,sent_at,deliver_at,delivered_at,transport_mode,distance_band,base_delivery_hours,transport_multiplier,story_seed,story_variant)
    values (conversation_id,sender_user,recipient_user,'pause read test',now()-interval '2 hours',now()-interval '1 hour',now()-interval '30 minutes','standard','long_distance',96,1,123,0)
    returning id into letter_id;
  perform set_config('request.jwt.claim.sub',recipient_user::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('app.allow_inactive_mode_change','1',true);
  update public.profiles set inactive_mode=true where id=recipient_user;
  perform public.mark_snail_mail_read(letter_id);
  select l.recipient_read_at into read_at from public.snail_mail_letters l where l.id=letter_id;
  if read_at is null then raise exception 'paused recipient did not receive a read timestamp'; end if;
end;
$$;
rollback;
`;
  execFileSync("docker", ["exec", "-i", "supabase_db_Penpal", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: sql, stdio: ["pipe", "ignore", "pipe"] });
});

test("a deactivated user cannot mutate profile blocks through direct table access", { skip: !hasLocalDatabase }, () => {
  const sql = String.raw`
begin;
do $$
declare
  blocker_user uuid;
  blocked_user uuid;
begin
  select p.id into blocker_user
    from public.profiles p
   where p.role = 'user'
     and p.deactivated_at is null
     and not p.inactive_mode
     and exists (select 1 from auth.users u where u.id = p.id and u.email_confirmed_at is not null)
   order by p.created_at
   limit 1;
  select p.id into blocked_user
    from public.profiles p
   where p.role = 'user'
     and p.id <> blocker_user
     and p.deactivated_at is null
     and exists (select 1 from auth.users u where u.id = p.id and u.email_confirmed_at is not null)
   order by p.created_at
   limit 1;
  if blocker_user is null or blocked_user is null then raise exception 'verified user fixtures unavailable'; end if;

  perform set_config('app.allow_account_status_change','1',true);
  perform set_config('request.jwt.claim.sub',blocker_user::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  update public.profiles set deactivated_at = now() where id = blocker_user;

  set local role authenticated;
  begin
    insert into public.profile_blocks(blocker_id, blocked_id) values (blocker_user, blocked_user);
    raise exception 'deactivated user mutated profile blocks';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;
rollback;
`;
  execFileSync("docker", ["exec", "-i", "supabase_db_Penpal", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: sql, stdio: ["pipe", "ignore", "pipe"] });
});
