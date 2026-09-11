import { createClient } from "@supabase/supabase-js";
import { snailMailArrivalEmail } from "./notification-email-templates.mjs";

const endpoint = "https://api.resend.com/emails";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
const apiKey = process.env.RESEND_API_KEY?.trim();
const from = process.env.NOTIFICATION_EMAIL_FROM?.trim() || process.env.SUPPORT_EMAIL_FROM?.trim() || "Pen-Pals <no-reply@pen-pals.net>";
const requestedBatchSize = Number.parseInt(process.env.BACKGROUND_JOB_BATCH_SIZE ?? "100", 10);
const batchSize = Number.isFinite(requestedBatchSize) ? Math.min(500, Math.max(1, requestedBatchSize)) : 100;

async function sendEmail(job) {
  const openUrl = new URL(`/app/messages/${encodeURIComponent(job.conversation_id)}`, siteUrl).toString();
  const template = snailMailArrivalEmail({ locale: job.locale === "es" ? "es" : "en", openUrl });
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `snail-mail-arrival-${job.letter_id}`,
    },
    body: JSON.stringify({
      from,
      to: [job.recipient_email],
      subject: template.subject,
      text: template.text,
      html: template.html,
      tags: [{ name: "source", value: "snail_mail_arrival" }],
    }),
  });
  return response.ok;
}

export async function runEmailNotifications(supabase) {
  const summary = { snail_mail_delivered: 0, claimed: 0, sent: 0, failed: 0 };
  const { data: delivered, error: deliveryError } = await supabase.rpc("process_snail_mail_delivery", { batch_size: batchSize });
  if (deliveryError) throw new Error("Snail Mail delivery processing failed.");
  summary.snail_mail_delivered = delivered ?? 0;

  const { data: claimed, error: claimError } = await supabase.rpc("claim_snail_mail_email_batch", { batch_size: batchSize });
  if (claimError) throw new Error("Snail Mail email queue could not be claimed.");
  const jobs = Array.isArray(claimed) ? claimed.filter((job) => job && typeof job.id === "string" && typeof job.letter_id === "string" && typeof job.conversation_id === "string" && typeof job.recipient_email === "string") : [];
  summary.claimed = jobs.length;

  for (const job of jobs) {
    let sent = false;
    try { sent = await sendEmail(job); } catch { sent = false; }
    if (sent) {
      const { error } = await supabase.rpc("complete_snail_mail_email_job", { job_id: job.id });
      if (error) throw new Error("Snail Mail email completion could not be recorded.");
      summary.sent += 1;
    } else {
      await supabase.rpc("fail_snail_mail_email_job", { job_id: job.id });
      summary.failed += 1;
    }
  }
  return summary;
}

async function main() {
  if (!url || !serviceRoleKey || !siteUrl || !apiKey) throw new Error("Email notification worker configuration is incomplete.");
  const supabase = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const result = await runEmailNotifications(supabase);
  process.stdout.write(JSON.stringify(result) + "\n");
  if (result.failed) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Email notification worker failed."}\n`);
  process.exitCode = 1;
});
