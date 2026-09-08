import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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

test("live escalation is staff-only, audited, and does not duplicate on retry", { skip: !hasLocalDatabase }, () => {
  const moderatorId = scalar("select id from public.profiles where username = 'mika' and deactivated_at is null limit 1");
  const adminId = scalar("select id from public.profiles where role = 'admin' and deactivated_at is null limit 1");
  const ordinaryUserId = scalar("select id from public.profiles where role = 'user' and deactivated_at is null limit 1");
  const caseId = scalar("select id from public.moderation_cases where status not in ('resolved','dismissed') order by created_at limit 1");
  assert.match(moderatorId, /^[0-9a-f-]{36}$/i, "a local moderator fixture is required");
  assert.match(adminId, /^[0-9a-f-]{36}$/i, "a local admin fixture is required");
  assert.match(ordinaryUserId, /^[0-9a-f-]{36}$/i, "a local ordinary-user fixture is required");
  assert.match(caseId, /^[0-9a-f-]{36}$/i, "a local open case fixture is required");

  const sql = `
begin;
select set_config('app.allow_role_change', '1', true);
select set_config('request.jwt.claim.sub', '${adminId}', true);
update public.profiles set role = 'moderator' where id = '${moderatorId}';
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '${ordinaryUserId}', true);
do $$
begin
  perform public.request_admin_moderation_review('${caseId}', 'ordinary user bypass');
  raise exception 'ordinary user unexpectedly escalated a case';
exception when others then
  if sqlerrm not like '%Moderator authorization required%' then raise; end if;
end
$$;
select set_config('request.jwt.claim.sub', '${moderatorId}', true);
update public.moderation_cases set needs_admin_review = false, admin_review_requested_at = null, admin_review_requested_by = null where id = '${caseId}';
update public.moderation_cases set assigned_staff_id = '${moderatorId}', claimed_at = now(), claim_expires_at = now() + interval '15 minutes', status = 'investigating' where id = '${caseId}';
delete from public.moderation_audit_log where case_id = '${caseId}' and action = 'case_admin_attention_requested';
select public.request_admin_moderation_review('${caseId}', 'Needs administrator review');
select public.request_admin_moderation_review('${caseId}', 'Retry should be idempotent');
do $$
begin
  if (select count(*) from public.moderation_cases where id = '${caseId}' and needs_admin_review) <> 1 then raise exception 'admin-attention marker was not set'; end if;
  if (select count(*) from public.moderation_audit_log where case_id = '${caseId}' and action = 'case_admin_attention_requested') <> 1 then raise exception 'escalation audit was duplicated or missing'; end if;
end
$$;
select set_config('request.jwt.claim.sub', '${adminId}', true);
do $$
begin
  if not exists (select 1 from public.admin_list_moderation_cases(null, null, 100, 0) where id = '${caseId}' and needs_admin_review) then raise exception 'admin queue did not expose attention marker'; end if;
end
$$;
rollback;`;
  execFileSync("docker", ["exec", "-i", "supabase_db_Penpal", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" });
});
