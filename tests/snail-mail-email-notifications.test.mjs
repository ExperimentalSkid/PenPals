import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const migration = await read("supabase/migrations/20260911203000_snail_mail_arrival_email.sql");
const worker = await read("scripts/run-email-notifications.mjs");
const templates = await read("scripts/notification-email-templates.mjs");
const settings = await read("src/app/app/settings/page.tsx");
const actions = await read("src/app/app/settings/data-actions.ts");
const exportRoute = await read("src/app/app/settings/data-export/route.ts");

test("Snail Mail arrival email is a private, retryable delivery-triggered outbox", () => {
  assert.match(migration, /add column if not exists email_snail_mail boolean not null default true/i);
  assert.match(migration, /create table if not exists public\.snail_mail_email_outbox/i);
  assert.match(migration, /unique references public\.snail_mail_letters\(id\) on delete cascade/i);
  assert.match(migration, /after update of delivered_at on public\.snail_mail_letters/i);
  assert.match(migration, /old\.delivered_at is null and new\.delivered_at is not null/i);
  assert.match(migration, /not p\.inactive_mode/i);
  assert.match(migration, /claim_snail_mail_email_batch/i);
  assert.match(migration, /for update of q skip locked/i);
  assert.match(migration, /grant execute on function public\.claim_snail_mail_email_batch\(integer\) to service_role/i);
});

test("email worker finalizes delivery, uses idempotency, and never sends letter content", () => {
  assert.match(worker, /process_snail_mail_delivery/);
  assert.match(worker, /claim_snail_mail_email_batch/);
  assert.match(worker, /Idempotency-Key.*snail-mail-arrival-/s);
  assert.match(worker, /complete_snail_mail_email_job/);
  assert.match(worker, /fail_snail_mail_email_job/);
  assert.match(worker, /source.*snail_mail_arrival/s);
  assert.doesNotMatch(worker, /job\.body|letter_body|attachment/i);
});

test("arrival template is bilingual and omits message/photo contents", () => {
  assert.match(templates, /A letter has arrived for you/);
  assert.match(templates, /Ha llegado una carta para ti/);
  assert.match(templates, /never included in this email/);
  assert.match(templates, /nunca se incluyen en este correo/);
  assert.match(templates, /Settings → Notifications/);
});

test("Settings and export expose the Snail Mail email preference", () => {
  assert.match(settings, /name="email_snail_mail"/);
  assert.match(settings, /email_snail_mail !== false/);
  assert.match(actions, /p_email_snail_mail/);
  assert.match(exportRoute, /"email_snail_mail"/);
});
