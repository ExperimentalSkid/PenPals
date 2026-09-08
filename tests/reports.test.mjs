import test from "node:test"; import assert from "node:assert/strict"; import { readFile } from "node:fs/promises";
const sql = await readFile(new URL("../supabase/migrations/20260901100000_add_reports.sql", import.meta.url), "utf8");
test("reports support all target types and reasons", () => { assert.match(sql, /target_type in \('profile','introduction','message'\)/); assert.match(sql, /spam/); assert.match(sql, /underage concern/); });
test("reports prevent self and duplicate reports", () => { assert.match(sql, /target = me/); assert.match(sql, /reports_one_per_target/); });
test("reports have private RLS and atomic decline option", () => { assert.match(sql, /Users submit own reports/); assert.match(sql, /decline_pending/); assert.match(sql, /status = 'declined'/); });
test("reported abusive introductions are excluded from response metrics", () => { assert.match(sql, /r\.target_type = 'introduction'/); assert.match(sql, /r\.status <> 'dismissed'/); assert.match(sql, /fake profile\/impersonation/); });

const reportAction = await readFile(new URL("../src/app/app/reports/actions.ts", import.meta.url), "utf8");
test("report action returns validation and rate-limit errors to the originating screen", () => {
  assert.match(reportAction, /safeReturnPath/);
  assert.match(reportAction, /redirect\(withReportState\(returnPath, "error"/);
  assert.match(reportAction, /redirect\(withReportState\(returnPath, "reported"/);
  assert.match(reportAction, /candidate\.startsWith\("\/\/"\)[\s\S]*?return fallback/);
  assert.match(reportAction, /parsed\.pathname\.startsWith\("\/\/"\)\) return fallback/);
});
