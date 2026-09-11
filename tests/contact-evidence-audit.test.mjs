import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { LOCAL_DB_CONTAINER } from "./helpers/local-db.mjs";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20260911174500_contact_evidence_audit.sql", root), "utf8");
const actions = await readFile(new URL("src/app/app/admin/support/actions.ts", root), "utf8");
const auditPage = await readFile(new URL("src/app/app/admin/audit/page.tsx", root), "utf8");

test("Contact evidence audit actions are distinct and admin-visible", () => {
  for (const action of ["contact_evidence_viewed", "contact_evidence_preserved", "contact_evidence_hold_released", "contact_investigation_escalated", "contact_export_prepared"]) {
    assert.match(migration, new RegExp(action));
    assert.match(auditPage, new RegExp(action));
  }
  assert.match(auditPage, /metadata\?\.ticket_id/);
  assert.match(auditPage, /\/app\/admin\/support\/\$\{entry\.metadata\.ticket_id\}/);
});

test("Contact hold actions use transactional audited wrappers", () => {
  assert.match(actions, /admin_preserve_contact_evidence/);
  assert.match(actions, /admin_release_contact_evidence_hold/);
  assert.doesNotMatch(actions.slice(actions.indexOf("createContactRetentionHold")), /set_data_retention_hold/);
  assert.match(migration, /contact_evidence_preserved[\s\S]*hold_id/);
  assert.match(migration, /contact_evidence_hold_released[\s\S]*hold_id/);
});

test("integrity access writes a Contact evidence view audit event", () => {
  const fn = migration.slice(migration.indexOf("create or replace function public.staff_get_contact_submission_integrity"));
  assert.match(fn, /insert into public\.moderation_audit_log/);
  assert.match(fn, /'contact_evidence_viewed'/);
  assert.doesNotMatch(fn, /if public\.is_admin\(\)/);
});

test("audit infrastructure works transactionally against the live schema", () => {
  const sql = `begin;\n${migration}\nDO $$\nDECLARE\n  admin_id uuid; ticket uuid; hold_id uuid; before_views bigint; after_views bigint;\nBEGIN\n  select id into admin_id from public.profiles where role='admin' and deactivated_at is null limit 1;\n  select id into ticket from public.support_tickets where ticket_type='public_contact' limit 1;\n  if admin_id is null or ticket is null then raise exception 'fixture missing'; end if;\n  perform set_config('request.jwt.claims', json_build_object('sub',admin_id::text,'role','authenticated')::text, true);\n  select count(*) into before_views from public.moderation_audit_log where action='contact_evidence_viewed' and metadata->>'ticket_id'=ticket::text;\n  perform public.staff_get_contact_submission_integrity(ticket);\n  select count(*) into after_views from public.moderation_audit_log where action='contact_evidence_viewed' and metadata->>'ticket_id'=ticket::text;\n  if after_views <> before_views + 1 then raise exception 'view audit missing'; end if;\n  hold_id := public.admin_preserve_contact_evidence(ticket, 'audit regression test');\n  if not exists (select 1 from public.moderation_audit_log where action='contact_evidence_preserved' and metadata->>'hold_id'=hold_id::text) then raise exception 'preserve audit missing'; end if;\n  perform public.admin_release_contact_evidence_hold(ticket, hold_id);\n  if not exists (select 1 from public.moderation_audit_log where action='contact_evidence_hold_released' and metadata->>'hold_id'=hold_id::text) then raise exception 'release audit missing'; end if;\nEND $$;\nrollback;`;
  execFileSync("docker", ["exec", "-i", LOCAL_DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: sql });
});
