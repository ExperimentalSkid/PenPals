import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { LOCAL_DB_CONTAINER } from "./helpers/local-db.mjs";
import { randomUUID } from "node:crypto";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const baseMigration = await read("supabase/migrations/20260902250000_moderation_content_flagging.sql");
const signalMigration = await read("supabase/migrations/20260904060000_contextual_creator_pairing.sql");
const serializationMigration = await read("supabase/migrations/20260904140000_serialize_moderation_signal_cases.sql");
const sourceMigration = await read("supabase/migrations/20260903230000_adult_commercial_detection_pack.sql");
const queueMigration = await read("supabase/migrations/20260903220000_moderation_admin_attention.sql");
const caseDetail = await read("src/app/app/admin/cases/[id]/page.tsx");

const hasLocalDatabase = (() => {
  try {
    execFileSync("docker", ["inspect", LOCAL_DB_CONTAINER], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

function runSql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", LOCAL_DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"],
    { input: sql, encoding: "utf8" },
  );
}

test("automated signal sources preserve evidence and route to the staff queue", () => {
  for (const source of ["profile_content_moderation_flag", "message_content_moderation_flag", "introduction_content_moderation_flag", "snail_mail_content_moderation_flag", "report_content_moderation_flag"]) {
    assert.match(`${baseMigration}\n${sourceMigration}`, new RegExp(`create trigger ${source}`));
  }
  assert.match(signalMigration, /content_snapshot/);
  assert.match(signalMigration, /content_hash/);
  assert.match(signalMigration, /case_id/);
  assert.match(signalMigration, /insert into public\.moderation_case_flags/);
  assert.match(signalMigration, /automated_flag_created/);
  assert.match(signalMigration, /source = case when source = 'report' then 'mixed' else source end/);
  assert.match(serializationMigration, /auto-case:/);
  assert.match(serializationMigration, /pg_advisory_xact_lock/);
  assert.match(serializationMigration, /Signals remain review-only/);
  assert.match(queueMigration, /c\.source/);
  assert.match(queueMigration, /c\.automated_flag_count/);
  assert.match(queueMigration, /order by[\s\S]*c\.priority desc/);
  assert.match(caseDetail, /Automated matches are triage signals only/);
  assert.match(caseDetail, /Exact preserved content/);
  assert.doesNotMatch(sourceMigration, /deactivate_account|admin_set_account_status|delete from public\.profiles/);
  assert.doesNotMatch(signalMigration, /deactivate_account|admin_set_account_status|delete from public\.profiles/);
});

test("live profile signal creates one review case with preserved evidence and no punishment", { skip: !hasLocalDatabase }, () => {
  const userId = randomUUID();
  const username = `signalqa${userId.replaceAll("-", "").slice(0, 12)}`;
  const email = `${username}@example.local`;
  const content = "Please visit onlyfans.com";
  const adminId = execFileSync(
    "docker",
    ["exec", LOCAL_DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-At", "-c", "select id from public.profiles where role = 'admin' and deactivated_at is null limit 1"],
    { encoding: "utf8" },
  ).trim();
  assert.match(adminId, /^[0-9a-f-]{36}$/i, "a local admin fixture is required");

  const sql = `
begin;
select set_config('request.jwt.claim.role','authenticated',true);
insert into auth.users(id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('${userId}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','${email}',now(),'{}','{}',now(),now());
select set_config('request.jwt.claim.sub','${userId}',true);
insert into public.profiles(id, username, display_name, birth_date, gender, country, city, bio)
values ('${userId}', '${username}', 'Moderation Signal QA', '1990-01-01', 'other', 'Portugal', 'Lisbon', '${content}');
-- A retry of the same detector input must not create another flag or case.
select public.flag_moderation_content('profile', '${userId}', '${userId}', 'bio', '${content}');
do $$
declare
  v_case_id uuid;
  v_source text;
  v_flag_count bigint;
  v_snapshot text;
  v_queue_count bigint;
begin
  select c.id, c.source, c.automated_flag_count
    into v_case_id, v_source, v_flag_count
    from public.moderation_cases c
   where c.primary_target_id = '${userId}'
   order by c.created_at desc
   limit 1;
  if v_case_id is null or v_source <> 'automated_flag' or v_flag_count < 1 then
    raise exception 'automated signal did not create a review case';
  end if;
  select f.content_snapshot into v_snapshot
    from public.moderation_content_flags f
   where f.case_id = v_case_id
   order by f.created_at desc
   limit 1;
  if v_snapshot <> '${content}' then raise exception 'preserved evidence snapshot mismatch'; end if;
  if not exists (select 1 from public.moderation_case_flags f where f.case_id = v_case_id) then
    raise exception 'flag was not linked to the case';
  end if;
  if exists (select 1 from public.profiles p where p.id = '${userId}' and (p.deactivated_at is not null or p.admin_deactivated_at is not null)) then
    raise exception 'automated signal changed account lifecycle state';
  end if;
  perform set_config('request.jwt.claim.sub','${adminId}',true);
  select count(*) into v_queue_count
    from public.admin_list_moderation_cases(null, null, 100, 0) q
   where q.id = v_case_id and q.source = 'automated_flag' and q.automated_flag_count >= 1;
  if v_queue_count <> 1 then raise exception 'case was not visible in the staff queue'; end if;
end $$;
select 'moderation_signal_chain_ok';
rollback;
`;
  const output = runSql(sql);
  assert.match(output, /moderation_signal_chain_ok/);
});
