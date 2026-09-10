import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const messagesActions = await readFile(new URL("../src/app/app/messages/actions.ts", import.meta.url), "utf8");
const conversationPage = await readFile(new URL("../src/app/app/messages/[id]/page.tsx", import.meta.url), "utf8");
const adminActions = await readFile(new URL("../src/app/app/admin/actions.ts", import.meta.url), "utf8");
const adminOverview = await readFile(new URL("../src/app/app/admin/page.tsx", import.meta.url), "utf8");
const adminReports = await readFile(new URL("../src/app/app/admin/reports/page.tsx", import.meta.url), "utf8");
const adminUserDetail = await readFile(new URL("../src/app/app/admin/users/[id]/page.tsx", import.meta.url), "utf8");
const adminAudit = await readFile(new URL("../src/app/app/admin/audit/page.tsx", import.meta.url), "utf8");

test("declining an introduction does not report success after an RPC error", () => {
  assert.match(messagesActions, /const \{ error \} = await db\.rpc\("decline_introduction"/);
  assert.match(messagesActions, /if \(error\) redirect\(`\/app\/introductions\?error=\$\{encodeURIComponent\(t\("server\.messages\.introDeclineFailed"\)\)\}`\)/);
  assert.match(messagesActions, /if \(error\)[\s\S]*?server\.messages\.introDeclineFailed[\s\S]*?redirect\("\/app\/messages"\)/);
});

test("revoking photo access surfaces RPC failures instead of redirecting as success", () => {
  assert.match(messagesActions, /const \{ error \} = await db\.rpc\("revoke_photo_access"/);
  assert.match(messagesActions, /if \(error\) redirect\(`\/app\/messages\/\$\{conversationId\}\?error=\$\{encodeURIComponent\(t\("server\.messages\.photoRevokeFailed"\)\)\}`\)/);
  assert.match(messagesActions, /if \(error\)[\s\S]*?server\.messages\.photoRevokeFailed[\s\S]*?redirect\(`\/app\/messages\/\$\{conversationId\}`\)/);
});

test("message send has one atomic write rather than a fallible follow-up timestamp write", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20260905430000_atomic_message_conversation_timestamp.sql", import.meta.url), "utf8");
  assert.doesNotMatch(messagesActions, /db\.from\("conversations"\)\.update/);
  assert.match(migration, /after insert on public\.messages/i);
  assert.match(migration, /set updated_at = greatest\(c\.updated_at, new\.created_at\)/);
});

test("read-state failures are returned and rendered instead of being silently ignored", () => {
  assert.match(messagesActions, /return error \? \{ error: "We couldn't update the conversation read state\. Please refresh\." \} : \{ error: null \}/);
  assert.match(conversationPage, /const readResult = await markRead\(id\)/);
  assert.match(conversationPage, /const readError = readResult\?\.error \?\? null/);
  assert.match(conversationPage, /error \|\| message \|\| readError/);
});

test("report status updates require both a database success and a matching report", () => {
  assert.match(adminActions, /\.update\(\{ status \}\)\.eq\("id", reportId\)\.select\("id"\)\.maybeSingle\(\)/);
  assert.match(adminActions, /if \(error \|\| !updatedReport\) redirect\(/);
  assert.match(adminActions, /redirect\(`\/app\/admin\/reports\?report=\$\{encodeURIComponent\(reportId\)\}&updated=1`\)/);
});

test("admin overview does not turn failed context queries into zero or empty success data", () => {
  assert.match(adminOverview, /error: summaryError/);
  assert.match(adminOverview, /error: reportsError/);
  assert.match(adminOverview, /error: auditError/);
  assert.match(adminOverview, /const contextLoadError = summaryError \|\| reportsError \|\| auditError/);
  assert.match(adminOverview, /role="alert"/);
  assert.match(adminOverview, /contextLoadError \? "—"/);
});

test("admin reports exposes failures for queue, identity, detail, audit, and related-account context", () => {
  for (const marker of ["reportsError", "peopleError", "detailError", "auditError", "targetUserDetailError"]) assert.match(adminReports, new RegExp(marker));
  assert.match(adminReports, /role="alert"/);
  assert.match(adminReports, /reportsError \? <p/);
  assert.match(adminReports, /auditError \? <p/);
});

test("admin user detail fails closed when access auditing fails and surfaces ancillary query errors", () => {
  assert.match(adminUserDetail, /import \{ notFound, redirect \} from "next\/navigation"/);
  assert.match(adminUserDetail, /const \{ error: accessLogError \} = await db\.rpc\("admin_log_user_detail_access"/);
  assert.match(adminUserDetail, /if \(accessLogError\) redirect\(/);
  for (const marker of ["securityError", "contentHistoryError", "userCasesError", "verificationError", "activityRankError", "conversationError"]) assert.match(adminUserDetail, new RegExp(marker));
  assert.match(adminUserDetail, /Some account context could not be loaded/);
  assert.match(adminUserDetail, /Security context could not be loaded/);
  assert.match(adminUserDetail, /Conversations could not be loaded/);
});

test("admin audit identity lookup failures are visible to staff", () => {
  assert.match(adminAudit, /error: profileLookupError/);
  assert.match(adminAudit, /let peopleError: any = null/);
  assert.match(adminAudit, /role="alert"/);
  assert.match(adminAudit, /Actor and target context could not be loaded/);
});
