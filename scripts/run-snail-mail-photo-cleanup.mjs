import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const requestedBatchSize = Number.parseInt(process.env.BACKGROUND_JOB_BATCH_SIZE ?? "100", 10);
const batchSize = Number.isFinite(requestedBatchSize) ? Math.min(500, Math.max(1, requestedBatchSize)) : 100;

if (!url || !serviceRoleKey) throw new Error("Snail Mail photo cleanup environment is incomplete.");

const supabase = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
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
    throw new Error("Snail Mail photo cleanup failed; jobs remain retryable.");
  }
  const { error: completeError } = await supabase.rpc("complete_snail_mail_attachment_deletion_batch", { completed_ids: ids });
  if (completeError) {
    await supabase.rpc("fail_snail_mail_attachment_deletion_batch", { failed_ids: ids, cleanup_error: completeError.message });
    throw new Error("Snail Mail photo cleanup completion failed; jobs remain retryable.");
  }
}

process.stdout.write(JSON.stringify({ snail_mail_photos_deleted: jobs.length }) + "\n");
