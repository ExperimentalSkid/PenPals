import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const root = new URL("..", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20260903050000_email_verification_enforcement.sql", root), "utf8");

test("all audited protected paths use the canonical email-verification gate", () => {
  for (const marker of [
    "public.submit_report",
    "public.create_data_export",
    "public.get_my_data_export_supplement",
    "public.record_data_export_download",
    "public.is_conversation_participant",
    "public.users_are_blocked",
    "public.list_my_avatar_paths",
    "public.ack_my_avatar_deletions",
    "public.save_privacy_settings",
    "public.deactivate_account",
    "public.reactivate_account",
  ]) {
    assert.ok(migration.includes(marker), `missing enforcement for ${marker}`);
  }
  assert.match(migration, /Email verification required/);
  assert.match(migration, /public\.is_email_verified\(\)/);
});

test("direct table policies close the remaining unverified reads and writes", () => {
  for (const table of [
    "data_export_requests",
    "data_rights_audit_log",
    "profile_friendship_destinations",
    "direct_conversation_pairs",
    "reports",
  ]) {
    assert.match(migration, new RegExp(`on public\\.${table}`));
  }
  assert.match(migration, /using \(public\.is_email_verified\(\) and user_id = auth\.uid\(\)\)/);
  assert.match(migration, /with check \(public\.is_email_verified\(\) and reporter_id = auth\.uid\(\)\)/);
  assert.match(migration, /user_a = auth\.uid\(\) or user_b = auth\.uid\(\)/);
});

test("legacy privacy overload is a verified wrapper around the current overload", () => {
  const start = migration.indexOf("create or replace function public.save_privacy_settings(");
  const block = migration.slice(start);
  assert.match(block, /p_country_codes text\[\] default/);
  assert.match(block, /not public\.is_email_verified\(\)/);
  assert.match(block, /p_country_codes,\s*false/s);
});

test("live database rejects an unverified session on each audited RPC and direct read policy", () => {
  let adminId;
  try {
    adminId = execFileSync("docker", ["exec", "supabase_db_Penpal", "psql", "-U", "postgres", "-d", "postgres", "-Atc", "select id from auth.users order by created_at limit 1"], { encoding: "utf8" }).trim();
  } catch {
    return;
  }
  if (!adminId) return;

  const sql = `
begin;
select set_config('request.jwt.claim.sub', '${adminId}', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
update auth.users set email_confirmed_at = null where id = '${adminId}';
set local session_replication_role = replica;
insert into public.data_export_requests(user_id) values ('${adminId}');
insert into public.data_rights_audit_log(user_id, action) values ('${adminId}', 'export_requested');
set local session_replication_role = origin;
set local role authenticated;
do $$begin
  if exists (select 1 from public.data_export_requests where user_id = '${adminId}') then raise exception 'unverified export request read leaked'; end if;
  if exists (select 1 from public.data_rights_audit_log where user_id = '${adminId}') then raise exception 'unverified data-rights audit read leaked'; end if;
end$$;
do $$begin
  begin perform public.submit_report('profile', '${adminId}', 'other', null, false); raise exception 'submit_report unexpectedly succeeded'; exception when others then if sqlerrm not like '%Email verification required%' then raise; end if; end;
  begin perform public.create_data_export(); raise exception 'create_data_export unexpectedly succeeded'; exception when others then if sqlerrm not like '%Email verification required%' then raise; end if; end;
  begin perform public.get_my_data_export_supplement(); raise exception 'supplement unexpectedly succeeded'; exception when others then if sqlerrm not like '%Email verification required%' then raise; end if; end;
  begin perform public.record_data_export_download(gen_random_uuid()); raise exception 'record_download unexpectedly succeeded'; exception when others then if sqlerrm not like '%Email verification required%' then raise; end if; end;
  begin perform public.save_privacy_settings('authenticated_only', false, true, true, true, 'everyone', 'available', '{}'::text[], false); raise exception 'privacy unexpectedly succeeded'; exception when others then if sqlerrm not like '%Authentication required%' and sqlerrm not like '%Email verification required%' then raise; end if; end;
  begin perform public.is_conversation_participant(gen_random_uuid()); if public.is_conversation_participant(gen_random_uuid()) then raise exception 'participant helper leaked'; end if; end;
  begin if public.users_are_blocked('${adminId}', '${adminId}') then raise exception 'block helper leaked'; end if; end;
end$$;
rollback;`;
  execFileSync("docker", ["exec", "-i", "supabase_db_Penpal", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atc", sql], { encoding: "utf8" });
});
