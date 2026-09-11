import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { LOCAL_DB_CONTAINER } from "./helpers/local-db.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const migration = await read("supabase/migrations/20260911183000_contact_investigations.sql");

test("Contact escalation is first-class, admin-only, and auto-preserves evidence", async () => {
  const detail = await read("src/app/app/admin/support/[id]/page.tsx");
  const actions = await read("src/app/app/admin/support/actions.ts");
  assert.match(migration, /create table if not exists public\.contact_investigations/);
  assert.match(migration, /ticket_id uuid not null unique references public\.support_tickets\(id\) on delete cascade/);
  assert.match(migration, /if not public\.is_admin\(\)/);
  assert.match(migration, /'contact_evidence'/);
  assert.match(migration, /contact_investigation_escalated/);
  assert.match(migration, /investigation_id/);
  assert.match(migration, /hold_id/);
  assert.match(migration, /sha256/);
  assert.match(detail, /Escalate to investigation/);
  assert.match(detail, /automatically preserves the ticket/);
  assert.match(actions, /admin_escalate_contact_investigation/);
});

test("Contact escalation migration executes transactionally", () => {
  const sql = `BEGIN;\n${migration}\nROLLBACK;\n`;
  execFileSync("docker", ["exec", "-i", LOCAL_DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: sql });
});


test("Contact escalation is idempotent and creates one active evidence hold", () => {
  const sql = `BEGIN;\n${migration}\nDO $$\nDECLARE\n  admin_id uuid; ticket uuid; first_id uuid; second_id uuid; hold_count bigint; audit_count bigint;\nBEGIN\n  select id into admin_id from public.profiles where role='admin' and deactivated_at is null limit 1;\n  select id into ticket from public.support_tickets where ticket_type='public_contact' order by created_at limit 1;\n  if admin_id is null or ticket is null then raise exception 'fixture missing'; end if;\n  perform set_config('request.jwt.claims', json_build_object('sub',admin_id::text,'role','authenticated')::text, true);\n  first_id := public.admin_escalate_contact_investigation(ticket, 'serious Contact investigation regression');\n  second_id := public.admin_escalate_contact_investigation(ticket, 'duplicate call should reuse');\n  if first_id is distinct from second_id then raise exception 'duplicate escalation created another investigation'; end if;\n  select count(*) into hold_count from public.data_retention_holds where category='contact_evidence' and record_id=ticket and released_at is null;\n  if hold_count <> 1 then raise exception 'expected one active Contact evidence hold, got %', hold_count; end if;\n  select count(*) into audit_count from public.moderation_audit_log where action='contact_investigation_escalated' and metadata->>'ticket_id'=ticket::text;\n  if audit_count <> 1 then raise exception 'expected one escalation audit event, got %', audit_count; end if;\nEND $$;\nROLLBACK;`;
  execFileSync("docker", ["exec", "-i", LOCAL_DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: sql });
});
