import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { LOCAL_DB_CONTAINER } from "./helpers/local-db.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const migration = await read("supabase/migrations/20260911172000_contact_submission_evidence.sql");

test("Contact submission evidence is immutable, hashed, and excludes verification secrets", async () => {
  const detail = await read("src/app/app/admin/support/[id]/page.tsx");
  const context = await read("src/app/app/admin/support/ContactAbuseContext.tsx");
  assert.match(migration, /create table if not exists public\.contact_submission_evidence/);
  assert.match(migration, /capture_source in \('verification_capture','backfill_existing_ticket'\)/);
  assert.match(migration, /extensions\.digest\(convert_to\(evidence_snapshot::text, 'UTF8'\), 'sha256'\)/);
  assert.match(migration, /Contact submission evidence is immutable/);
  assert.match(migration, /allow_contact_evidence_delete/);
  assert.doesNotMatch(migration, /'token_hash'\s*,\s*pending\.token_hash/);
  assert.match(detail, /staff_get_contact_submission_integrity/);
  assert.match(context, /Original submission integrity/);
  assert.match(context, /stored snapshot matches SHA-256/);
});

test("verification capture creates a reproducible immutable snapshot", { skip: !LOCAL_DB_CONTAINER }, () => {
  const tokenHash = "b".repeat(64);
  const sql = `begin;\n${migration}\n\ndo $$\ndeclare\n  pending_id uuid;\n  captured_ticket_id uuid;\n  stored_hash text;\n  recomputed text;\n  snap jsonb;\nbegin\n  pending_id := public.create_public_contact_verification(\n    'Evidence Fixture', 'evidence-fixture@example.test', 'other', 'Evidence fixture subject',\n    'Original evidence fixture message for immutable capture.', '${tokenHash}',\n    jsonb_build_object('ip','203.0.113.77','client_key_hash','fixture-network-hash','request_metadata_version',3)\n  );\n  captured_ticket_id := public.verify_public_contact_submission(\n    pending_id, '${tokenHash}',\n    jsonb_build_object('ip','203.0.113.77','client_key_hash','fixture-network-hash','user_agent','fixture-agent')\n  );\n  select snapshot, sha256 into snap, stored_hash from public.contact_submission_evidence where contact_submission_evidence.ticket_id = captured_ticket_id;\n  if snap is null then raise exception 'verification snapshot missing'; end if;\n  recomputed := encode(extensions.digest(convert_to(snap::text,'UTF8'),'sha256'),'hex');\n  if stored_hash <> recomputed then raise exception 'verification snapshot hash mismatch'; end if;\n  if snap::text like '%' || '${tokenHash}' || '%' then raise exception 'verification secret leaked into snapshot'; end if;\n  if snap->>'capture_source' <> 'verification_capture' then raise exception 'capture provenance incorrect'; end if;\n  if snap->'submission'->>'message' <> 'Original evidence fixture message for immutable capture.' then raise exception 'original message missing'; end if;\n  if not exists (select 1 from public.public_contact_pending_verifications p where p.id=pending_id and p.message is null and p.request_metadata='{}'::jsonb) then raise exception 'pending record not scrubbed'; end if;\nend $$;\nrollback;\n`;
  execFileSync("docker", ["exec", "-i", LOCAL_DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: sql, stdio: ["pipe", "pipe", "pipe"] });
});
