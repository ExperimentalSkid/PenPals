import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("Admin Center exposes one predictable operational navigation", async () => {
  const chrome = await read("src/app/app/admin/AdminChrome.tsx");
  for (const label of ["Overview", "Mod Inbox", "Reports", "Users", "Age appeals", "Audit log", "Rules"]) assert.match(chrome, new RegExp(label));
  assert.match(chrome, /aria-current=\{active === item\.id \? "page"/);
  assert.match(chrome, /admin-nav-link-active/);
});

test("admin queues use compact status treatment and preserve deep links", async () => {
  const cases = await read("src/app/app/admin/cases/page.tsx");
  const reports = await read("src/app/app/admin/reports/page.tsx");
  assert.match(cases, /StatusChip/);
  assert.match(cases, /\/app\/admin\/cases\/\$\{item\.id\}/);
  assert.match(reports, /StatusChip/);
  assert.match(reports, /\/app\/admin\/reports\?report=/);
});

test("age appeal decisions keep deliberate confirmation in a client boundary", async () => {
  const page = await read("src/app/app/admin/age-appeals/page.tsx");
  const decision = await read("src/app/app/admin/age-appeals/AgeAppealDecision.tsx");
  assert.match(page, /AgeAppealDecision/);
  assert.match(decision, /^"use client"/);
  assert.match(decision, /window\.confirm/);
});

test("case detail presents actionable evidence without bypassing privileged review", async () => {
  const detail = await read("src/app/app/admin/cases/[id]/page.tsx");
  const conversation = await read("src/app/app/admin/conversations/[id]/page.tsx");
  const userDetail = await read("src/app/app/admin/users/[id]/page.tsx");
  const evidenceProjection = await read("supabase/migrations/20260903210000_case_evidence_authorized_match.sql");
  assert.match(detail, /Evidence &amp; Review/);
  assert.match(detail, /Exact preserved content/);
  assert.match(detail, /Matched term\/domain/);
  assert.match(detail, /No automated signal matched this case\. Review the human report and preserved reported content below\./);
  for (const action of ["Open flagged message", "Review conversation", "View reported user", "View reporter", "Case history", "View user conversations"]) {
    assert.match(detail, new RegExp(action));
  }
  assert.match(detail, /reporter_id/);
  assert.match(detail, /flag\.conversation_id/);
  assert.match(detail, /#case-history/);
  assert.match(conversation, /id=\{`message-\$\{message\.id\}`\}/);
  assert.match(userDetail, /id="user-conversations"/);
  assert.match(evidenceProjection, /'matched_term', case when public\.is_admin\(\) then r\.term else null end/);
  assert.match(evidenceProjection, /revoke all on function public\.admin_get_moderation_case_flags/);
});
