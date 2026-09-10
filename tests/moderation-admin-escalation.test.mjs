import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { LOCAL_DB_CONTAINER } from "./helpers/local-db.mjs";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("moderators have a reason-gated, idempotent admin-attention action", async () => {
  const migration = await read("supabase/migrations/20260903220000_moderation_admin_attention.sql");
  const actions = await read("src/app/app/admin/actions.ts");
  const detail = await read("src/app/app/admin/cases/[id]/page.tsx");

  assert.match(migration, /needs_admin_review boolean not null default false/);
  assert.match(migration, /admin_review_requested_at timestamptz/);
  assert.match(migration, /admin_review_requested_by uuid/);
  assert.match(migration, /if not public\.is_moderator\(\)/);
  assert.match(migration, /An escalation reason is required/);
  assert.match(migration, /if item\.needs_admin_review then\s+return;/s);
  assert.match(migration, /case_admin_attention_requested/);
  assert.match(migration, /needs_admin_review and c\.status not in \('resolved', 'dismissed'\)/);
  assert.match(actions, /role !== "moderator"/);
  assert.match(actions, /request_admin_moderation_review/);
  assert.match(detail, /Need an administrator\?/);
  assert.match(detail, /Escalate to Admin/);
  assert.match(detail, /Admin attention requested/);
});

const hasLocalDatabase = (() => {
  try {
    execFileSync("docker", ["inspect", LOCAL_DB_CONTAINER], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

test("live escalation is staff-only, audited, and does not duplicate on retry", { skip: !hasLocalDatabase }, () => {
  // Build a real report-backed open case in this transaction. Local data may
  // legitimately have no open moderation work, so an ambient case is not a
  // valid authorization fixture.
  const sql = String.raw`
begin;
do $$
declare
  v_admin_id uuid := gen_random_uuid();
  v_moderator_id uuid := gen_random_uuid();
  v_ordinary_user_id uuid := gen_random_uuid();
  v_subject_id uuid := gen_random_uuid();
  v_conversation_id uuid;
  v_message_id uuid;
  v_report_id uuid;
  v_case_id uuid;
  fixture_prefix text := 'ma_' || left(replace(gen_random_uuid()::text, '-', ''), 12);
begin
  insert into auth.users(id, email, email_confirmed_at)
    values (v_admin_id, v_admin_id::text || '@example.test', now()),
           (v_moderator_id, v_moderator_id::text || '@example.test', now()),
           (v_ordinary_user_id, v_ordinary_user_id::text || '@example.test', now()),
           (v_subject_id, v_subject_id::text || '@example.test', now());
  insert into public.profiles(id, username, display_name, birth_date, gender, country, country_code, city, location_precision, bio, quote, looking_for)
    values
      (v_admin_id, fixture_prefix || '_a', 'Escalation Admin', '1990-01-01', 'Not specified', 'NO', 'NO', '', 'country', 'Fixture admin bio.', 'A fixture quote.', 'friendship'),
      (v_moderator_id, fixture_prefix || '_m', 'Escalation Moderator', '1990-01-01', 'Not specified', 'NO', 'NO', '', 'country', 'Fixture moderator bio.', 'A fixture quote.', 'friendship'),
      (v_ordinary_user_id, fixture_prefix || '_o', 'Escalation User', '1990-01-01', 'Not specified', 'NO', 'NO', '', 'country', 'Fixture user bio.', 'A fixture quote.', 'friendship'),
      (v_subject_id, fixture_prefix || '_s', 'Escalation Subject', '1990-01-01', 'Not specified', 'NO', 'NO', '', 'country', 'Fixture subject bio.', 'A fixture quote.', 'friendship');
  perform set_config('app.allow_role_change', '1', true);
  update public.profiles set role = 'admin' where id = v_admin_id;
  update public.profiles set role = 'moderator' where id = v_moderator_id;
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_admin_id::text, true);
  insert into public.conversations(communication_mode) values ('instant') returning id into v_conversation_id;
  insert into public.conversation_participants(conversation_id, user_id)
    values (v_conversation_id, v_admin_id), (v_conversation_id, v_subject_id);
  insert into public.messages(conversation_id, sender_id, body)
    values (v_conversation_id, v_subject_id, 'A clean temporary message for escalation authorization.')
    returning id into v_message_id;
  insert into public.reports(reporter_id, target_type, target_id, target_message_id, reason, details)
    values (v_admin_id, 'message', v_message_id, v_message_id, 'other', 'Temporary escalation authorization fixture')
    returning id into v_report_id;
  select mcr.case_id into v_case_id
    from public.moderation_case_reports mcr where mcr.report_id = v_report_id;
  if v_case_id is null then raise exception 'temporary report did not link to a moderation case'; end if;

  perform set_config('request.jwt.claim.sub', v_ordinary_user_id::text, true);
  begin
    perform public.request_admin_moderation_review(v_case_id, 'ordinary user bypass');
    raise exception 'ordinary user unexpectedly escalated a case';
  exception when others then
    if sqlerrm like '%ordinary user unexpectedly escalated a case%' then raise; end if;
    if sqlerrm not like '%Moderator authorization required%' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', v_moderator_id::text, true);
  update public.moderation_cases
     set assigned_staff_id = v_moderator_id,
         claimed_at = now(),
         claim_expires_at = now() + interval '15 minutes',
         status = 'investigating'
   where id = v_case_id;
  perform public.request_admin_moderation_review(v_case_id, 'Needs administrator review');
  perform public.request_admin_moderation_review(v_case_id, 'Retry should be idempotent');
  if (select count(*) from public.moderation_cases c where c.id = v_case_id and c.needs_admin_review) <> 1 then
    raise exception 'admin-attention marker was not set';
  end if;
  if (select count(*) from public.moderation_audit_log a where a.case_id = v_case_id and a.action = 'case_admin_attention_requested') <> 1 then
    raise exception 'escalation audit was duplicated or missing';
  end if;

  perform set_config('request.jwt.claim.sub', v_admin_id::text, true);
  if not exists (
    select 1 from public.admin_list_moderation_cases(null, null, 100, 0) q
     where q.id = v_case_id and q.needs_admin_review
  ) then
    raise exception 'admin queue did not expose attention marker';
  end if;
end
$$;
rollback;
`;
  execFileSync("docker", ["exec", "-i", LOCAL_DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" });
});
