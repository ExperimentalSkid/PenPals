import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("investigation return paths are internal-only and preserve URL context", async () => {
  const helper = await read("src/app/app/admin/investigation-context.ts");
  assert.match(helper, /value\.startsWith\("\/\/"\)/);
  assert.match(helper, /ADMIN_PATH\.test\(value\)/);
  assert.match(helper, /parsed\.searchParams\.set\("return_to", safeReturn\)/);
  assert.match(helper, /parsed\.hash/);
});

test("case links retain the case and history context", async () => {
  const page = await read("src/app/app/admin/cases/[id]/page.tsx");
  assert.match(page, /const investigationReturn = caseContextHref\(id\)/);
  assert.match(page, /backHref=\{returnTo \?\? "\/app\/admin\/cases"\}/);
  assert.match(page, /withAdminReturnTo\(`\/app\/admin\/users\/\$\{item\.subject_user_id\}`, investigationReturn\)/);
  assert.match(page, /reviewHref\(flag\.conversation_id,[\s\S]*investigationReturn\)/);
  assert.match(page, /withAdminReturnTo\(`\/app\/admin\/reports\?report=\$\{report\.id\}`, investigationReturn\)/);
  assert.match(page, /href="#case-history"/);
});

test("conversation review keeps case/report/user context through the reason gate", async () => {
  const page = await read("src/app/app/admin/conversations/[id]/page.tsx");
  assert.match(page, /case\?: string/);
  assert.match(page, /return_to\?: string/);
  assert.match(page, /const backHref = returnTo \?\? \(caseId \? caseContextHref\(caseId\)/);
  assert.match(page, /if \(caseId\) preservedParams\.set\("case", caseId\)/);
  assert.match(page, /preservedParams\.set\("return_to", returnTo\)/);
  assert.match(page, /const reasonAction = reviewPath \+ \(focusTarget \?/);
  assert.match(page, /backLabel=\{backLabel\}/);
});

test("user detail links return to the originating investigation section", async () => {
  const page = await read("src/app/app/admin/users/[id]/page.tsx");
  assert.match(page, /return_to\?: string/);
  assert.match(page, /const returnTo = safeAdminReturnTo\(query\.return_to\)/);
  assert.match(page, /const userContextHref = \(anchor\?: string\)/);
  assert.match(page, /href=\{returnTo \?\? "\/app\/admin\/users"\}/);
  assert.match(page, /withAdminReturnTo\(`\/app\/admin\/cases\/\$\{item\.id\}`, userContextHref\("moderation-cases"\)\)/);
  assert.match(page, /withAdminReturnTo\(`\/app\/admin\/conversations\/\$\{conversation\.id\}/);
  assert.match(page, /withAdminReturnTo\(`\/app\/admin\/reports\?report=\$\{report\.id\}`, userContextHref/);
  assert.match(page, /withAdminReturnTo\(`\/app\/profile\/\$\{profile\.username\}\?from=admin`, userContextHref\("public-profile"\)\)/);
});

test("public profile accepts only a validated staff return context", async () => {
  const page = await read("src/app/app/profile/[username]/page.tsx");
  assert.match(page, /return_to\?: string/);
  assert.match(page, /const adminReturnTo = safeAdminReturnTo\(navigation\.return_to\)/);
  assert.match(page, /const backHref = adminReturnTo/);
  assert.match(page, /backLabel = adminReturnTo/);
  assert.match(page, /safeAdminReturnTo/);
});

test("queue and report detail links carry their current investigation context", async () => {
  const cases = await read("src/app/app/admin/cases/page.tsx");
  const reports = await read("src/app/app/admin/reports/page.tsx");
  assert.match(cases, /const queueContext = `\/app\/admin\/cases\?/);
  assert.match(cases, /withAdminReturnTo\(`\/app\/admin\/cases\/\$\{item\.id\}`, queueContext\)/);
  assert.match(reports, /return_to\?: string/);
  assert.match(reports, /const returnTo = safeAdminReturnTo\(filters\.return_to\)/);
  assert.match(reports, /const reportContext = filters\.report/);
  assert.match(reports, /withAdminReturnTo\(`\/app\/admin\/cases\/\$\{report\.case_id\}`, reportContext\)/);
  assert.match(reports, /withAdminReturnTo\(`\/app\/admin\/conversations\/\$\{conversationId\}\?report=\$\{report\?\.id\}`, reportContext\)/);
});
