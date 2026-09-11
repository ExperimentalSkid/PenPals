import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20260911190000_contact_evidence_export.sql", root), "utf8");
const route = await readFile(new URL("src/app/api/admin/contact-export/[id]/route.ts", root), "utf8");
const page = await readFile(new URL("src/app/app/admin/support/[id]/page.tsx", root), "utf8");
const helper = await readFile(new URL("src/lib/contact-evidence-export.ts", root), "utf8");

test("forensic Contact export requires an investigation and verified immutable evidence", () => {
  assert.match(migration, /Contact investigation required for evidence export/);
  assert.match(migration, /Contact evidence integrity check failed/);
  assert.match(migration, /admin_get_contact_export_bundle/);
  assert.match(route, /contact_export_prepared/);
  assert.match(route, /manifest_sha256/);
  assert.match(route, /archive_sha256/);
  assert.match(route, /immutable_evidence_sha256/);
});

test("export package includes expected forensic components and embedded attachment bytes", () => {
  for (const name of ["original-submission.json", "ticket.json", "messages.json", "request-metadata.json", "investigation.json", "retention-holds.json", "audit-log.json", "attachments/index.json", "SUMMARY.txt", "manifest.json", "SHA256SUMS"]) {
    assert.match(route, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(route, /storage\.from\("support-attachments"\)\.download/);
  assert.match(route, /size does not match its evidence record/);
  assert.match(helper, /crc32/);
  assert.match(helper, /createStoredZip/);
});

test("Contact investigation UI exposes export only inside escalated investigation state", () => {
  const investigationBranch = page.slice(page.indexOf("{contactInvestigation ? <>"), page.indexOf("</> : <>", page.indexOf("{contactInvestigation ? <>")));
  assert.match(investigationBranch, /Export evidence package/);
  assert.match(investigationBranch, /\/api\/admin\/contact-export\/\$\{id\}/);
  assert.match(investigationBranch, /Export reason/);
});

test("stored ZIP writer produces a standards-readable archive", async () => {
  const dir = await mkdtemp(join(tmpdir(), "penpals-contact-export-"));
  const modulePath = fileURLToPath(new URL("../src/lib/contact-evidence-export.ts", import.meta.url));
  const script = `import { createStoredZip } from ${JSON.stringify(modulePath)}; import { writeFileSync } from 'node:fs'; const zip=createStoredZip([{name:'b.txt',data:Buffer.from('beta')},{name:'a.txt',data:Buffer.from('alpha')}],new Date('2026-09-11T15:00:00Z')); writeFileSync(${JSON.stringify(join(dir,"test.zip"))},zip);`;
  execFileSync("node", ["--experimental-strip-types", "--input-type=module", "-e", script]);
  const listing = execFileSync("unzip", ["-t", join(dir, "test.zip")], { encoding: "utf8" });
  assert.match(listing, /a\.txt/);
  assert.match(listing, /b\.txt/);
  assert.match(listing, /No errors detected/);
});
