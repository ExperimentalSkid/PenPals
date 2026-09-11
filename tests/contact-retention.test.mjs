import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const migration = await read("supabase/migrations/20260911165000_contact_evidence_retention.sql");

test("contact evidence extends the existing retention framework", async () => {
  const page = await read("src/app/app/admin/privacy-retention/page.tsx");
  const actions = await read("src/app/app/admin/actions.ts");
  assert.match(migration, /contact_evidence/);
  assert.match(migration, /ticket_type = 'public_contact'/);
  assert.match(migration, /h\.record_id is null or h\.record_id = t\.id/);
  assert.match(migration, /Contact ticket not found/);
  assert.match(page, /\["contact_evidence", "Contact evidence"\]/);
  assert.match(actions, /"contact_evidence"/);
});

test("contact retention purge does not target ordinary support tickets", () => {
  const branch = migration.slice(migration.indexOf("elsif policy_row.category = 'contact_evidence'"));
  assert.match(branch, /delete from public\.support_tickets t/);
  assert.match(branch, /t\.ticket_type = 'public_contact'/);
  assert.match(branch, /t\.status = 'resolved'/);
  assert.match(branch, /coalesce\(t\.resolved_at, t\.updated_at\) < cutoff/);
  assert.doesNotMatch(branch, /ticket_type <> 'public_contact'/);
});

test("dashboard counts a missing Contact retention policy as unconfigured", () => {
  assert.match(migration, /expected_retention_categories[\s\S]*contact_evidence/);
  assert.match(migration, /p\.category is null or not p\.enabled or p\.retention_period is null/);
});


test("Contact ticket exposes admin-only record hold controls", async () => {
  const detail = await read("src/app/app/admin/support/[id]/page.tsx");
  const actions = await read("src/app/app/admin/support/actions.ts");
  assert.match(detail, /role === "admin"/);
  assert.match(detail, /Evidence retention/);
  assert.match(detail, /Preserve this ticket/);
  assert.match(detail, /Release ticket hold/);
  assert.match(detail, /category-wide Contact evidence hold/);
  assert.match(actions, /requireAdmin\(\)/);
  assert.match(actions, /admin_preserve_contact_evidence/);
  assert.match(actions, /ticket_uuid:\s*ticketId/);
  assert.match(actions, /admin_release_contact_evidence_hold/);
  assert.match(actions, /admin_release_contact_evidence_hold/);
});
