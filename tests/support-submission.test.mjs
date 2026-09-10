import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("Support submission has a user-owned RPC and private attachment storage", async () => {
  const migration = await read("supabase/migrations/20260904230500_support_submission.sql");
  assert.match(migration, /create table if not exists public\.support_ticket_attachments/);
  assert.match(migration, /create or replace function public\.submit_support_ticket/);
  assert.match(migration, /public\.is_email_verified\(\)/);
  assert.match(migration, /revoke all on function public\.submit_support_ticket/);
  assert.match(migration, /support-attachments/);
  assert.match(migration, /Users upload support attachments/);
});

test("Support submission page collects only request details and calls the server action", async () => {
  const page = await read("src/app/app/support/page.tsx");
  const button = await read("src/app/app/support/SubmitSupportButton.tsx");
  const action = await read("src/app/app/support/actions.ts");
  const nextConfig = await read("next.config.ts");
  const confirmation = await read("supabase/migrations/20260904230700_support_submission_confirmation.sql");
  assert.match(page, /submitSupportTicket/);
  for (const field of ["category", "subject", "description", "attachments"]) assert.match(page, new RegExp(`name=\\"${field}\\"`));
  assert.match(page, /app\.support\.accountAttached/);
  assert.match(action, /submit_support_ticket/);
  assert.match(action, /MAX_ATTACHMENTS/);
  assert.match(action, /support-attachments/);
  assert.match(page, /get_my_support_ticket_confirmation/);
  assert.match(page, /app\.support\.ticketId/);
  assert.match(page, /app\.support\.currentStatus/);
  assert.match(page, /app\.support\.viewRequest/);
  assert.match(page, /submission_token/);
  assert.match(action, /p_submission_token/);
  assert.match(nextConfig, /bodySizeLimit:\s*["']35mb["']/);
  assert.match(action, /submitted=1&ticket=/);
  assert.match(button, /useFormStatus/);
  assert.match(button, /app\.support\.submitting/);
  assert.match(confirmation, /submission_token uuid/);
  assert.match(confirmation, /get_my_support_ticket_confirmation/);
});
