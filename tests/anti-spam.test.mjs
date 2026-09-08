import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../supabase/migrations/20260902190000_report_and_appeal_rate_limits.sql", import.meta.url), "utf8");
const rateFix = await readFile(new URL("../supabase/migrations/20260902190100_report_rate_check.sql", import.meta.url), "utf8");
const appealFix = await readFile(new URL("../supabase/migrations/20260902190200_age_appeal_rejection_cooldown.sql", import.meta.url), "utf8");
const ageMigration = await readFile(new URL("../supabase/migrations/20260902180000_age_gate_and_appeals.sql", import.meta.url), "utf8");
const reportAction = await readFile(new URL("../src/app/app/reports/actions.ts", import.meta.url), "utf8");
const effectiveMigration = `${migration}\n${rateFix}\n${appealFix}`;

test("report submissions are serialized and limited to one per minute", () => {
  assert.match(effectiveMigration, /pg_advisory_xact_lock\(hashtextextended\(me::text, 0\)\)/);
  assert.match(effectiveMigration, /created_at > now\(\) - interval '60 seconds'/);
  assert.match(effectiveMigration, /Please wait before submitting another report/);
});

test("report submissions enforce a rolling ten-report daily maximum", () => {
  assert.match(effectiveMigration, /count\(\*\).*created_at > now\(\) - interval '24 hours'/s);
  assert.match(effectiveMigration, />= 10/);
  assert.match(effectiveMigration, /on public\.reports \(reporter_id, created_at desc\)/);
});

test("same target and reason can only be reported once per 24 hours", () => {
  assert.match(effectiveMigration, /target_type = kind/);
  assert.match(effectiveMigration, /target_id = target/);
  assert.match(effectiveMigration, /reason = report_reason/);
  assert.match(effectiveMigration, /created_at > now\(\) - interval '24 hours'/);
  assert.match(effectiveMigration, /drop index if exists public\.reports_one_per_target/);
  assert.match(effectiveMigration, /reports_duplicate_window_idx/);
});

test("direct report table writes cannot bypass the submission RPC", () => {
  assert.match(effectiveMigration, /revoke insert on table public\.reports from public, anon, authenticated/);
  assert.match(effectiveMigration, /grant execute on function public\.submit_report\(text, uuid, text, text, boolean\)\s+to authenticated/s);
});

test("report rate-limit failures use the neutral server action message", () => {
  assert.match(reportAction, /Please wait before submitting another report/);
  assert.match(reportAction, /error\.message/);
});

test("age appeals allow only one pending request and impose a 24-hour rejection cooldown", () => {
  assert.match(ageMigration, /age_appeals_one_pending_idx/);
  assert.match(appealFix, /status = 'pending'/);
  assert.match(appealFix, /status = 'rejected'/);
  assert.match(appealFix, /reviewed_at > now\(\) - interval '24 hours'/);
  assert.match(appealFix, /pg_advisory_xact_lock/);
});

test("repeated failed appeal submissions remain rate-limited by durable rejection decisions", () => {
  assert.match(appealFix, /status = 'rejected'/);
  assert.match(appealFix, /reviewed_at is not null/);
  assert.match(appealFix, /reviewed_at > now\(\) - interval '24 hours'/);
  assert.match(appealFix, /Correction requests are temporarily limited/);
  assert.match(appealFix, /drop table if exists public\.age_appeal_cooldowns/);
});

test("admin approval clears the relevant age-gate cooldown state", () => {
  assert.match(appealFix, /delete from public\.age_gate_cooldowns where normalized_email_hash = appeal\.normalized_email_hash/);
  assert.match(appealFix, /admin_review_age_appeal/);
});
