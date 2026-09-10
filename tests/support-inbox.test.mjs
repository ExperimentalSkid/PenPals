import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("Support Inbox has a separate staff-only ticket model and projections", async () => {
  const migration = await read("supabase/migrations/20260904220000_support_inbox_foundation.sql");
  const attachmentProjection = await read("supabase/migrations/20260904230600_support_staff_attachments.sql");
  assert.match(migration, /create table if not exists public\.support_tickets/);
  assert.match(migration, /create table if not exists public\.support_ticket_messages/);
  assert.match(migration, /alter table public\.support_tickets enable row level security/);
  assert.match(migration, /revoke all on table public\.support_tickets/);
  assert.match(migration, /create or replace function public\.staff_list_support_tickets/);
  assert.match(migration, /create or replace function public\.staff_support_open_count/);
  assert.match(migration, /if not public\.is_moderator\(\)/);
  assert.match(migration, /waiting_staff/);
  assert.match(migration, /waiting_user/);
  assert.match(migration, /total_count bigint/);
  assert.match(migration, /create or replace function public\.staff_get_support_ticket/);
  assert.match(migration, /revoke all on function public\.staff_list_support_tickets/);
  assert.match(attachmentProjection, /'attachments'/);
  assert.match(attachmentProjection, /if not public\.is_moderator\(\)/);
});

test("Support Inbox has filters, pagination, and a dedicated ticket route", async () => {
  const page = await read("src/app/app/admin/support/page.tsx");
  const detail = await read("src/app/app/admin/support/[id]/page.tsx");
  const viewer = await read("src/app/app/support/SupportAttachmentViewer.tsx");
  const chrome = await read("src/app/app/admin/AdminChrome.tsx");
  const navigation = await read("src/app/app/AppNavigation.tsx");
  assert.match(page, /requireStaff/);
  assert.match(page, /staff_list_support_tickets/);
  for (const filter of ["All tickets", "Open", "Waiting for staff", "Waiting for user", "Resolved", "Mine", "Unassigned", "Category", "Search tickets", "Sort"]) assert.match(page, new RegExp(filter));
  assert.match(page, /\/app\/admin\/support\/\$\{ticket\.id\}/);
  assert.match(detail, /staff_get_support_ticket/);
  assert.match(detail, /Support messages/);
  assert.match(detail, /Ticket details/);
  assert.match(detail, /createSignedUrl/);
  assert.match(detail, /SupportAttachmentViewer/);
  assert.match(viewer, /role="dialog"/);
  assert.match(viewer, /aria-modal="true"/);
  assert.match(viewer, /Escape/);
  assert.match(viewer, /ArrowRight/);
  assert.match(viewer, /app\.attachments\.previewInline/);
  assert.match(chrome, /Support Inbox/);
  assert.match(navigation, /app\/admin\/support/);
  assert.match(navigation, /role === "admin" \|\| role === "moderator"/);
  assert.match(navigation, /supportInboxCount/);
});
