import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => fs.readFile(new URL(path, root), "utf8");

test("user support request RPCs are owner scoped", async () => {
  const migration = (await Promise.all([
    read("supabase/migrations/20260904230800_support_user_requests.sql"),
    read("supabase/migrations/20260904230900_support_user_conversation.sql"),
  ])).join("\n");
  assert.match(migration, /create or replace function public\.get_my_support_tickets\(\)/);
  assert.match(migration, /create or replace function public\.get_my_support_ticket\(ticket_uuid uuid\)/);
  assert.match(migration, /auth\.uid\(\)/g);
  assert.match(migration, /t\.requester_id = me/);
  assert.match(migration, /and t\.requester_id = me/);
  assert.match(migration, /'messages'/);
  assert.match(migration, /not m\.is_internal/);
  assert.match(migration, /'attachments'/);
  assert.match(migration, /Users read support attachments/);
  const replyMigration = await read("supabase/migrations/20260904231000_support_user_replies.sql");
  assert.match(replyMigration, /create or replace function public\.reply_to_support_ticket/);
  assert.match(replyMigration, /requester_id = me/);
  assert.match(replyMigration, /status = 'resolved'/);
  assert.match(replyMigration, /submission_token/);
  assert.match(replyMigration, /status = 'waiting_staff'/);
  assert.match(migration, /grant execute on function public\.get_my_support_tickets\(\) to authenticated/);
  assert.match(migration, /grant execute on function public\.get_my_support_ticket\(uuid\) to authenticated/);
  const staffLifecycle = await read("supabase/migrations/20260904232000_support_staff_lifecycle.sql");
  assert.match(staffLifecycle, /staff_claim_support_ticket/);
  assert.match(staffLifecycle, /staff_release_support_ticket/);
  assert.match(staffLifecycle, /staff_reply_to_support_ticket/);
  assert.match(staffLifecycle, /is_internal, submission_token/);
  assert.match(staffLifecycle, /status = 'waiting_user'/);
  assert.match(staffLifecycle, /staff_add_support_ticket_note/);
  assert.match(staffLifecycle, /values \(ticket_uuid, me, clean_body, true\)/);
  assert.match(staffLifecycle, /staff_set_support_ticket_status/);
  assert.match(staffLifecycle, /status = 'resolved'/);
  assert.match(staffLifecycle, /Resolved support tickets can only be reopened as open/);
  const claimBoundary = await read("supabase/migrations/20260904232100_support_staff_claim_boundary.sql");
  assert.match(claimBoundary, /staff_support_require_claim/);
  assert.match(claimBoundary, /Claim this support ticket before taking action/);
  assert.match(claimBoundary, /assigned_staff_id = auth\.uid\(\)/);
  assert.match(claimBoundary, /staff_reply_to_support_ticket_unchecked/);
  assert.match(claimBoundary, /revoke all on function public\.staff_reply_to_support_ticket_unchecked/);
});

test("my support requests pages use owner-scoped data and expose required fields", async () => {
  const listPage = await read("src/app/app/support/requests/page.tsx");
  const detailPage = await read("src/app/app/support/requests/[id]/page.tsx");
  const supportPage = await read("src/app/app/support/page.tsx");
  assert.match(listPage, /get_my_support_tickets/);
  assert.match(listPage, /ticket_code/);
  assert.match(listPage, /subject/);
  assert.match(listPage, /category/);
  assert.match(listPage, /status/);
  assert.match(listPage, /updated_at/);
  assert.match(listPage, /\/app\/support\/requests\/\$\{ticket\.id\}/);
  assert.match(listPage, /app\.support\.none/);
  assert.match(detailPage, /get_my_support_ticket/);
  assert.match(detailPage, /SupportAttachmentViewer/);
  assert.match(detailPage, /app\.support\.updates/);
  assert.match(detailPage, /whitespace-pre-wrap/);
  assert.match(detailPage, /replyToSupportTicket/);
  assert.match(detailPage, /SubmitSupportReplyButton/);
  assert.match(detailPage, /status !== "resolved"/);
  assert.match(detailPage, /app\.support\.resolvedNoReply/);
  const replyButton = await read("src/app/app/support/SubmitSupportReplyButton.tsx");
  assert.match(replyButton, /useFormStatus/);
  const action = await read("src/app/app/support/actions.ts");
  assert.match(action, /reply_to_support_ticket/);
  assert.match(detailPage, /notFound\(\)/);
  assert.match(detailPage, /app\.support\.backMine/);
  assert.match(supportPage, /\/app\/support\/requests/);
});

test("staff support detail separates public replies, internal notes, assignment, and status controls", async () => {
  const page = await read("src/app/app/admin/support/[id]/page.tsx");
  const actions = await read("src/app/app/admin/support/actions.ts");
  assert.match(page, /Requester-visible/);
  assert.match(page, /Public reply/);
  assert.match(page, /Internal staff note/);
  assert.match(page, /Staff-only/);
  assert.match(page, /Claim ticket/);
  assert.match(page, /Release assignment/);
  assert.match(page, /Waiting for user/);
  assert.match(page, /status === "resolved"/);
  assert.match(actions, /staff_reply_to_support_ticket/);
  assert.match(actions, /staff_add_support_ticket_note/);
  assert.match(actions, /staff_claim_support_ticket/);
  assert.match(actions, /staff_release_support_ticket/);
  assert.match(actions, /staff_set_support_ticket_status/);
});
