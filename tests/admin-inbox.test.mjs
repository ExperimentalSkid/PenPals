import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("Admin Inbox is a server-filtered administrator-only projection", async () => {
  const migration = await read("supabase/migrations/20260904210000_admin_escalation_inbox.sql");
  assert.match(migration, /create or replace function public\.admin_list_escalated_moderation_cases/);
  assert.match(migration, /if not public\.is_admin\(\)/);
  assert.match(migration, /where c\.needs_admin_review/);
  assert.match(migration, /case_admin_attention_requested/);
  assert.match(migration, /escalation_reason text/);
  assert.match(migration, /revoke all on function public\.admin_list_escalated_moderation_cases/);
  assert.match(migration, /grant execute on function public\.admin_list_escalated_moderation_cases[\s\S]*to authenticated/);
});

test("Admin Inbox reuses the moderation case workstation and is admin-only in navigation", async () => {
  const route = await read("src/app/app/admin/inbox/page.tsx");
  const chrome = await read("src/app/app/admin/AdminChrome.tsx");
  const navigation = await read("src/app/app/AppNavigation.tsx");
  assert.match(route, /requireAdmin/);
  assert.match(route, /admin_list_escalated_moderation_cases/);
  assert.match(route, /Escalation/);
  assert.match(route, /escalation_reason/);
  assert.match(route, /escalated_by_name/);
  assert.match(route, /\/app\/admin\/cases\/\$\{item\.id\}/);
  assert.match(chrome, /Admin Inbox/);
  assert.match(chrome, /showNav = isAdmin/);
  assert.match(chrome, /showRules=\{isAdmin\}/);
  assert.match(navigation, /role === "admin".*\/app\/admin\/inbox/s);
});

test("case review exposes a report summary without changing existing evidence actions", async () => {
  const detail = await read("src/app/app/admin/cases/[id]/page.tsx");
  assert.match(detail, /Report summary/);
  assert.match(detail, /subject_summary/);
  assert.match(detail, /primaryReport/);
  assert.match(detail, /Preserved content/);
  assert.match(detail, /Evidence &amp; Review/);
  assert.match(detail, /Escalate to Admin/);
  assert.match(detail, /No automated signal matched this case\. Review the human report and preserved reported content below\./);
});
