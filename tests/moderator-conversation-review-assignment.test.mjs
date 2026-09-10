import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const migration = await readFile(
  new URL("supabase/migrations/20260903070000_require_active_case_assignment_for_moderator_conversation_review.sql", root),
  "utf8",
);
const actionScopeMigration = await readFile(
  new URL("supabase/migrations/20260904163000_scope_moderation_case_actions.sql", root),
  "utf8",
);
const actionClaimMigration = await readFile(
  new URL("supabase/migrations/20260904164000_require_claim_for_moderator_actions.sql", root),
  "utf8",
);
const statusAuditMigration = await readFile(
  new URL("supabase/migrations/20260904165000_restore_case_status_audit_context.sql", root),
  "utf8",
);
const caseDetail = await readFile(
  new URL("src/app/app/admin/cases/[id]/page.tsx", root),
  "utf8",
);

test("moderator conversation review requires an active assignment while admins retain context access", () => {
  assert.match(migration, /if not admin_access then/);
  assert.match(migration, /moderation_case_reports/);
  assert.match(migration, /assigned_staff_id = auth\.uid\(\)/);
  assert.match(migration, /claim_expires_at is not null/);
  assert.match(migration, /claim_expires_at > now\(\)/);
  assert.match(migration, /status not in \('resolved', 'dismissed'\)/);
  assert.match(migration, /active moderation case assignment is required/);
  assert.match(migration, /if not staff_access then raise exception 'Moderator authorization required'/);
  assert.match(migration, /A meaningful review reason is required/);
  assert.match(migration, /conversation_review/);
  assert.match(migration, /moderation_audit_log/);
  assert.match(migration, /metadata, case_id\) values/);
});

test("moderator case status changes require the same active claim as conversation review", () => {
  assert.match(actionScopeMigration, /not public\.is_admin\(\)/);
  assert.match(actionScopeMigration, /assigned_staff_id = auth\.uid\(\)/);
  assert.match(actionScopeMigration, /claim_expires_at > now\(\)/);
  assert.match(actionScopeMigration, /active moderation case assignment is required/);
});

test("detector terms remain administrator-only in the case-flags RPC", () => {
  assert.match(actionScopeMigration, /'matched_term', case when public\.is_admin\(\) then r\.term else null end/);
  assert.match(actionScopeMigration, /'matched_value', case when public\.is_admin\(\) then f\.matched_value else null end/);
});

test("moderator escalation, flag resolution, and notes require an active claim", () => {
  for (const name of ["request_admin_moderation_review", "resolve_moderation_content_flag", "add_moderation_case_note"]) {
    assert.match(actionClaimMigration, new RegExp(`create or replace function public\\.${name}`));
  }
  assert.match(actionClaimMigration, /assigned_staff_id = auth\.uid\(\)/);
  assert.match(actionClaimMigration, /claim_expires_at > now\(\)/);
  assert.match(actionClaimMigration, /active moderation case assignment is required/);
  assert.match(actionClaimMigration, /not public\.is_admin\(\)/);
});

test("claim-bound case status changes retain prior status in audit history", () => {
  assert.match(statusAuditMigration, /previous_status text/);
  assert.match(statusAuditMigration, /select status into previous_status/);
  assert.match(statusAuditMigration, /previous_status, new_status/);
  assert.match(statusAuditMigration, /assigned_staff_id = auth\.uid\(\)/);
});

test("case controls explain the claim requirement before showing moderator actions", () => {
  assert.match(caseDetail, /const canMutateCase = role === "admin" \|\| activeClaim/);
  assert.match(caseDetail, /Claim this case before updating its status/);
  assert.match(caseDetail, /Claim this case before recording a note/);
  assert.match(caseDetail, /Claim this case before resolving this flag/);
});

const hasLocalDatabase = (() => {
  try {
    execFileSync("docker", ["inspect", "supabase_db_Penpal"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

function scalar(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", "supabase_db_Penpal", "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { encoding: "utf8" },
  ).trim();
}

test("live moderator review is limited to the assigned, unexpired case and remains audited", { skip: !hasLocalDatabase }, () => {
  const moderatorId = scalar("select id from public.profiles where username = 'mika' limit 1");
  const adminId = scalar("select id from public.profiles where role = 'admin' and deactivated_at is null limit 1");
  const ordinaryUserId = scalar("select id from public.profiles where role = 'user' and deactivated_at is null limit 1");
  const messageRow = scalar("select id::text || '|' || conversation_id::text from public.messages order by created_at, id limit 1");
  assert.match(moderatorId, /^[0-9a-f-]{36}$/i, "a local moderator fixture is required");
  assert.match(adminId, /^[0-9a-f-]{36}$/i, "a local admin fixture is required");
  assert.match(ordinaryUserId, /^[0-9a-f-]{36}$/i, "a local ordinary-user fixture is required");
  const [messageId, conversationId] = messageRow.split("|");
  assert.match(messageId, /^[0-9a-f-]{36}$/i, "a local message fixture is required");
  assert.match(conversationId, /^[0-9a-f-]{36}$/i, "a local conversation fixture is required");

  const sql = `
begin;
select set_config('app.allow_role_change', '1', true);
select set_config('request.jwt.claim.sub', '${adminId}', true);
update public.profiles set role = 'moderator' where id = '${moderatorId}';
insert into public.reports(reporter_id, target_type, target_id, target_message_id, reason, details)
values ('${adminId}', 'message', '${messageId}', '${messageId}', 'other', 'temporary moderator assignment authorization fixture');
do $$
declare
  v_report_id uuid;
  v_case_id uuid;
begin
  select r.id into v_report_id from public.reports r where r.reporter_id = '${adminId}' and r.target_message_id = '${messageId}' order by r.created_at desc limit 1;
  select mcr.case_id into v_case_id from public.moderation_case_reports mcr where mcr.report_id = v_report_id;
  if v_report_id is null or v_case_id is null then raise exception 'temporary report did not link to a moderation case'; end if;

  update public.moderation_cases set assigned_staff_id = null, claimed_at = null, claim_expires_at = null, status = 'new' where id = v_case_id;
  perform set_config('request.jwt.claim.sub', '${moderatorId}', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  begin
    perform public.admin_get_conversation_review('${conversationId}', null, v_report_id, 'Review reported message context');
    raise exception 'unassigned moderator unexpectedly received conversation access';
  exception when others then
    if sqlerrm not like '%active moderation case assignment is required%' then raise; end if;
  end;

  update public.moderation_cases set assigned_staff_id = '${moderatorId}', claimed_at = now(), claim_expires_at = now() + interval '15 minutes', status = 'investigating' where id = v_case_id;
  if public.admin_get_conversation_review('${conversationId}', null, v_report_id, 'Review reported message context') is null then raise exception 'assigned moderator did not receive conversation review'; end if;

  update public.moderation_cases set claim_expires_at = now() - interval '1 minute' where id = v_case_id;
  begin
    perform public.admin_get_conversation_review('${conversationId}', null, v_report_id, 'Review reported message context');
    raise exception 'expired moderator claim unexpectedly received conversation access';
  exception when others then
    if sqlerrm not like '%active moderation case assignment is required%' then raise; end if;
  end;

  update public.moderation_cases set assigned_staff_id = '${adminId}', claimed_at = now(), claim_expires_at = now() + interval '15 minutes' where id = v_case_id;
  begin
    perform public.admin_get_conversation_review('${conversationId}', null, v_report_id, 'Review reported message context');
    raise exception 'stolen moderator claim unexpectedly received conversation access';
  exception when others then
    if sqlerrm not like '%active moderation case assignment is required%' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', '${adminId}', true);
  if public.admin_get_conversation_review('${conversationId}', null, v_report_id, 'Review reported message context') is null then raise exception 'admin lost existing report-context access'; end if;

  perform set_config('request.jwt.claim.sub', '${ordinaryUserId}', true);
  begin
    perform public.admin_get_conversation_review('${conversationId}', null, v_report_id, 'Review reported message context');
    raise exception 'ordinary user unexpectedly received conversation access';
  exception when others then
    if sqlerrm not like '%Moderator authorization required%' then raise; end if;
  end;
end
$$;
rollback;`;
  execFileSync("docker", ["exec", "-i", "supabase_db_Penpal", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" });
});

test("live unassigned moderator status mutation is denied", { skip: !hasLocalDatabase }, () => {
  // The status boundary needs an open case, but no durable open case should
  // be required in a developer database. Create the minimal real case and
  // staff identities inside the rolled-back transaction.
  const sql = String.raw`
begin;
do $$
declare
  v_admin_id uuid := gen_random_uuid();
  v_moderator_id uuid := gen_random_uuid();
  v_subject_id uuid := gen_random_uuid();
  v_case_id uuid;
  fixture_prefix text := 'ms_' || left(replace(gen_random_uuid()::text, '-', ''), 12);
begin
  insert into auth.users(id, email, email_confirmed_at)
    values (v_admin_id, v_admin_id::text || '@example.test', now()),
           (v_moderator_id, v_moderator_id::text || '@example.test', now()),
           (v_subject_id, v_subject_id::text || '@example.test', now());
  insert into public.profiles(id, username, display_name, birth_date, gender, country, country_code, city, location_precision, bio, quote, looking_for)
    values
      (v_admin_id, fixture_prefix || '_a', 'Status Admin', '1990-01-01', 'Not specified', 'NO', 'NO', '', 'country', 'Fixture admin bio.', 'A fixture quote.', 'friendship'),
      (v_moderator_id, fixture_prefix || '_m', 'Status Moderator', '1990-01-01', 'Not specified', 'NO', 'NO', '', 'country', 'Fixture moderator bio.', 'A fixture quote.', 'friendship'),
      (v_subject_id, fixture_prefix || '_s', 'Status Subject', '1990-01-01', 'Not specified', 'NO', 'NO', '', 'country', 'Fixture subject bio.', 'A fixture quote.', 'friendship');
  perform set_config('app.allow_role_change', '1', true);
  update public.profiles set role = 'admin' where id = v_admin_id;
  update public.profiles set role = 'moderator' where id = v_moderator_id;
  insert into public.moderation_cases(subject_user_id, primary_target_type, primary_target_id, status)
    values (v_subject_id, 'profile', v_subject_id, 'new') returning id into v_case_id;
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_moderator_id::text, true);
  begin
    perform public.set_moderation_case_status(v_case_id, 'investigating', null, 'Unassigned status mutation check');
    raise exception 'unassigned moderator changed case status';
  exception when others then
    if sqlerrm like '%unassigned moderator changed case status%' then raise; end if;
    if sqlerrm not like '%active moderation case assignment is required%' then raise; end if;
  end;
  update public.moderation_cases
     set assigned_staff_id = v_moderator_id,
         claimed_at = now(),
         claim_expires_at = now() + interval '15 minutes',
         status = 'new'
   where id = v_case_id;
  perform public.set_moderation_case_status(v_case_id, 'investigating', null, 'Assigned status audit check');
  if not exists (
    select 1 from public.moderation_audit_log a
     where a.case_id = v_case_id
       and a.action = 'case_status_change'
       and a.old_status = 'new'
       and a.new_status = 'investigating'
  ) then
    raise exception 'case status audit did not preserve previous status';
  end if;
end $$;
rollback;
`;
  execFileSync("docker", ["exec", "-i", "supabase_db_Penpal", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" });
});

test("live moderator case flags omit protected detector terms", { skip: !hasLocalDatabase }, () => {
  const moderatorId = scalar("select id from public.profiles where username = 'mika' and deactivated_at is null limit 1");
  const adminId = scalar("select id from public.profiles where role = 'admin' and deactivated_at is null limit 1");
  assert.match(moderatorId, /^[0-9a-f-]{36}$/i, "a local moderator fixture is required");
  assert.match(adminId, /^[0-9a-f-]{36}$/i, "a local admin fixture is required");
  const sql = `
begin;
select set_config('app.allow_role_change','1',true);
select set_config('request.jwt.claim.sub','${adminId}',true);
update public.profiles set role='moderator' where id='${moderatorId}';
update public.profiles set bio='Please visit onlyfans.com for a moderation projection check.' where id='${moderatorId}';
do $$
declare
  moderator_case uuid;
  moderator_payload jsonb;
  admin_payload jsonb;
begin
  select f.case_id into moderator_case
    from public.moderation_content_flags f
   where f.target_user_id='${moderatorId}'
   order by f.created_at desc
   limit 1;
  if moderator_case is null then raise exception 'flag fixture unavailable'; end if;
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub','${moderatorId}',true);
  select public.admin_get_moderation_case_flags(moderator_case) into moderator_payload;
  if position('"matched_term": "' in moderator_payload::text) > 0 or position('"matched_value": "' in moderator_payload::text) > 0 then
    raise exception 'moderator received a detector term';
  end if;
  perform set_config('request.jwt.claim.sub','${adminId}',true);
  select public.admin_get_moderation_case_flags(moderator_case) into admin_payload;
  if position('"matched_term": "' in admin_payload::text) = 0 then
    raise exception 'administrator lost detector term context';
  end if;
end $$;
rollback;`;
  execFileSync("docker", ["exec", "-i", "supabase_db_Penpal", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" });
});

test("live moderator mutations require the claimed case and preserve assigned actions", { skip: !hasLocalDatabase }, () => {
  const moderatorId = scalar("select id from public.profiles where username = 'mika' and deactivated_at is null limit 1");
  const adminId = scalar("select id from public.profiles where role = 'admin' and deactivated_at is null limit 1");
  assert.match(moderatorId, /^[0-9a-f-]{36}$/i, "a local moderator fixture is required");
  assert.match(adminId, /^[0-9a-f-]{36}$/i, "a local admin fixture is required");
  const sql = `
begin;
select set_config('app.allow_role_change','1',true);
select set_config('request.jwt.claim.sub','${adminId}',true);
update public.profiles set role='moderator' where id='${moderatorId}';
update public.profiles set bio='Please visit onlyfans.com for the claim-bound action check.' where id='${moderatorId}';
do $$
declare
  moderator_case uuid;
  flag_id uuid;
  note_id uuid;
begin
  select f.case_id, f.id into moderator_case, flag_id
    from public.moderation_content_flags f
   where f.target_user_id='${moderatorId}'
   order by f.created_at desc
   limit 1;
  if moderator_case is null or flag_id is null then raise exception 'flag fixture unavailable'; end if;
  update public.moderation_cases
     set assigned_staff_id=null, claimed_at=null, claim_expires_at=null,
         status='new', needs_admin_review=false
   where id=moderator_case;
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub','${moderatorId}',true);
  begin
    perform public.request_admin_moderation_review(moderator_case,'Unassigned escalation action check');
    raise exception 'unassigned escalation succeeded';
  exception when others then
    if sqlerrm like '%unassigned escalation succeeded%' then raise; end if;
    if sqlerrm not like '%active moderation case assignment is required%' then raise; end if;
  end;
  begin
    perform public.resolve_moderation_content_flag(flag_id,'cleared','Unassigned flag action check');
    raise exception 'unassigned flag resolution succeeded';
  exception when others then
    if sqlerrm like '%unassigned flag resolution succeeded%' then raise; end if;
    if sqlerrm not like '%active moderation case assignment is required%' then raise; end if;
  end;
  begin
    perform public.add_moderation_case_note(moderator_case,'Unassigned note action check');
    raise exception 'unassigned note succeeded';
  exception when others then
    if sqlerrm like '%unassigned note succeeded%' then raise; end if;
    if sqlerrm not like '%active moderation case assignment is required%' then raise; end if;
  end;
  update public.moderation_cases
     set assigned_staff_id='${moderatorId}', claimed_at=now(),
         claim_expires_at=now()+interval '15 minutes', status='investigating'
   where id=moderator_case;
  select public.add_moderation_case_note(moderator_case,'Assigned action check') into note_id;
  if note_id is null then raise exception 'assigned moderator could not add a case note'; end if;
  perform public.resolve_moderation_content_flag(flag_id,'cleared','Assigned action check');
end $$;
rollback;`;
  execFileSync("docker", ["exec", "-i", "supabase_db_Penpal", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" });
});
