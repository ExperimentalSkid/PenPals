import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("case evidence exposes investigation context and safe recovery states", async () => {
  const page = await read("src/app/app/admin/cases/[id]/page.tsx");
  assert.match(page, /Evidence &amp; Review/);
  assert.match(page, /Exact preserved content/);
  assert.match(page, /flag\.content_snapshot/);
  assert.match(page, /flag\.target_type/);
  assert.match(page, /flag\.created_at/);
  assert.match(page, /flag\.conversation_id/);
  assert.match(page, /View reported user/);
  assert.match(page, /View reported user evidence/);
  assert.match(page, /View user evidence/);
  assert.match(page, /Case history/);
  assert.match(page, /if \(flagError\)/);
  assert.match(page, /couldn&apos;t load the evidence for this case/);
  assert.match(page, /No automated signal matched this case/);
  assert.match(page, /requires an active assigned case with report context/);
});

test("flagged-message navigation preserves exact focus through the reason gate", async () => {
  const casePage = await read("src/app/app/admin/cases/[id]/page.tsx");
  const conversation = await read("src/app/app/admin/conversations/[id]/page.tsx");
  assert.match(casePage, /params\.set\("focus", "message-" \+ targetId\)/);
  assert.match(casePage, /#message-\${encodeURIComponent\(targetId\)}/);
  assert.match(conversation, /focus\?: string/);
  assert.match(conversation, /focusTarget = \/\^message-/);
  assert.match(conversation, /reasonAction = reviewPath \+ \(focusTarget \? /);
  assert.match(conversation, /action=\{reasonAction\}/);
  assert.match(conversation, /id=\{`message-\$\{message\.id\}`\}/);
  assert.match(conversation, /focusTarget === "message-" \+ message\.id/);
  assert.match(conversation, /aria-current=\{focusTarget === "message-" \+ message\.id/);
  assert.match(conversation, /admin_get_conversation_review/);
  assert.match(conversation, /access_reason: accessReason/);
});

test("privileged investigation gates remain assignment- and reason-bound", async () => {
  const migration = await read("supabase/migrations/20260903070000_require_active_case_assignment_for_moderator_conversation_review.sql");
  assert.match(migration, /A meaningful review reason is required/);
  assert.match(migration, /assigned_staff_id = auth\.uid\(\)/);
  assert.match(migration, /claim_expires_at > now\(\)/);
  assert.match(migration, /if not admin_access and report_uuid is null/);
  assert.match(migration, /moderation_audit_log/);
});
