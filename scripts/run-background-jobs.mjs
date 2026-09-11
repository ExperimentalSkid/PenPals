import { createClient } from "@supabase/supabase-js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const requestedBatchSize = Number.parseInt(process.env.BACKGROUND_JOB_BATCH_SIZE ?? "100", 10);
const batchSize = Number.isFinite(requestedBatchSize) ? Math.min(500, Math.max(1, requestedBatchSize)) : 100;

export async function runBackgroundJobs(supabase, batchSize = 100) {
  const summary = { avatar_jobs_processed: 0, snail_mail_delivered: 0, snail_mail_photos_deleted: 0, seo_snapshots_captured: 0, retention: null };
  const failures = [];
  // Keep dependent work together, but do not let one subsystem starve others.
  const attempt = async (name, work) => {
    try { await work(); } catch { failures.push(name); }
  };

  await attempt("avatar_cleanup", async () => {
    const { data: claimed, error: claimError } = await supabase.rpc("claim_avatar_deletion_batch", { batch_size: batchSize });
    if (claimError) throw new Error("Unable to claim avatar cleanup jobs.");

    const jobs = Array.isArray(claimed)
      ? claimed.filter((job) => job && typeof job.id === "string" && typeof job.path === "string")
      : [];
    if (jobs.length) {
      const ids = jobs.map((job) => job.id);
      const paths = jobs.map((job) => job.path);
      const { error: storageError } = await supabase.storage.from("avatars").remove(paths);
      if (storageError) {
        await supabase.rpc("fail_avatar_deletion_batch", {
          failed_ids: ids,
          cleanup_error: storageError.message,
        });
        throw new Error("Avatar cleanup jobs failed and were returned to the retry queue.");
      }

      const { error: completeError } = await supabase.rpc("complete_avatar_deletion_batch", { completed_ids: ids });
      if (completeError) {
        await supabase.rpc("fail_avatar_deletion_batch", {
          failed_ids: ids,
          cleanup_error: completeError.message,
        });
        throw new Error("Avatar cleanup jobs could not be completed and remain retryable.");
      }
    }
    summary.avatar_jobs_processed = jobs.length;
  });

  await attempt("introduction_expiry", async () => {
    const { error: expiryError } = await supabase.rpc("expire_introductions");
    if (expiryError) throw new Error("Introduction expiry job failed.");
  });

  await attempt("snail_mail_delivery", async () => {
    const { data: snailMailDelivered, error: snailMailError } = await supabase.rpc("process_snail_mail_delivery", { batch_size: batchSize });
    if (snailMailError) throw new Error("Snail Mail delivery job failed.");
    summary.snail_mail_delivered = snailMailDelivered ?? 0;
  });

  await attempt("snail_mail_photo_cleanup", async () => {
    const { error: enqueueError } = await supabase.rpc("enqueue_expired_snail_mail_attachments", { batch_size: batchSize });
    if (enqueueError) throw new Error("Unable to enqueue expired Snail Mail photos.");
    const { data: claimed, error: claimError } = await supabase.rpc("claim_snail_mail_attachment_deletion_batch", { batch_size: batchSize });
    if (claimError) throw new Error("Unable to claim Snail Mail photo cleanup jobs.");
    const jobs = Array.isArray(claimed) ? claimed.filter((job) => job && typeof job.id === "string" && typeof job.path === "string") : [];
    if (jobs.length) {
      const ids = jobs.map((job) => job.id);
      const paths = jobs.map((job) => job.path);
      const { error: storageError } = await supabase.storage.from("snail-mail-attachments").remove(paths);
      if (storageError) {
        await supabase.rpc("fail_snail_mail_attachment_deletion_batch", { failed_ids: ids, cleanup_error: storageError.message });
        throw new Error("Snail Mail photo cleanup failed and was returned to the retry queue.");
      }
      const { error: completeError } = await supabase.rpc("complete_snail_mail_attachment_deletion_batch", { completed_ids: ids });
      if (completeError) {
        await supabase.rpc("fail_snail_mail_attachment_deletion_batch", { failed_ids: ids, cleanup_error: completeError.message });
        throw new Error("Snail Mail photo cleanup could not be completed and remains retryable.");
      }
    }
    summary.snail_mail_photos_deleted = jobs.length;
  });

  await attempt("seo_refresh", async () => {
    const { error: seoAggregateRefreshError } = await supabase.rpc("refresh_seo_community_aggregates");
    if (seoAggregateRefreshError) throw new Error("SEO aggregate refresh job failed.");

    const { error: seoEligibilityError } = await supabase.rpc("evaluate_seo_community_eligibility");
    if (seoEligibilityError) throw new Error("SEO eligibility evaluation job failed.");

    const { data: seoSnapshotsCaptured, error: seoHistoryError } = await supabase.rpc("capture_seo_community_aggregate_snapshots");
    if (seoHistoryError) throw new Error("SEO aggregate history job failed.");
    summary.seo_snapshots_captured = seoSnapshotsCaptured ?? 0;
  });

  await attempt("retention_purge", async () => {
    const { data: purge, error: purgeError } = await supabase.rpc("purge_retained_data");
    if (purgeError) throw new Error("Retention purge failed.");
    summary.retention = purge;
  });
  return { ...summary, failed_jobs: failures };
}

async function main() {
  if (!url || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for background jobs.");
  }
  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const result = await runBackgroundJobs(supabase, batchSize);
  process.stdout.write(JSON.stringify(result) + "\n");
  if (result.failed_jobs.length) {
    process.stderr.write(`Background jobs failed: ${result.failed_jobs.join(", ")}. Other independent jobs were attempted.\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Background jobs failed."}\n`);
  process.exitCode = 1;
});
