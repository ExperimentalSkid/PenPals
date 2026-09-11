import test from "node:test";
import assert from "node:assert/strict";
import { runBackgroundJobs } from "../scripts/run-background-jobs.mjs";

function client(failAt) {
  const calls = [];
  return {
    calls,
    async rpc(name) {
      calls.push(name);
      if (name === failAt) return { error: { message: "private diagnostic" } };
      if (name === "claim_avatar_deletion_batch") return { data: [{ id: "job", path: "owner/avatar.png" }] };
      if (name === "claim_snail_mail_attachment_deletion_batch") return { data: [] };
      return { data: 3 };
    },
    storage: { from: () => ({ remove: async () => {
      calls.push("storage.remove");
      if (failAt === "storage.remove") throw new Error("private diagnostic");
      return {};
    } }) },
  };
}

test("all existing independent jobs run and SEO dependency order stays intact", async () => {
  const db = client();
  assert.deepEqual(await runBackgroundJobs(db, 50), {
    avatar_jobs_processed: 1, snail_mail_delivered: 3, snail_mail_photos_deleted: 0,
    seo_snapshots_captured: 3, retention: 3, failed_jobs: [],
  });
  assert.deepEqual(db.calls, ["claim_avatar_deletion_batch", "storage.remove", "complete_avatar_deletion_batch",
    "expire_introductions", "process_snail_mail_delivery", "enqueue_expired_snail_mail_attachments",
    "claim_snail_mail_attachment_deletion_batch", "refresh_seo_community_aggregates",
    "evaluate_seo_community_eligibility", "capture_seo_community_aggregate_snapshots", "purge_retained_data"]);
});

for (const failure of ["claim_avatar_deletion_batch", "storage.remove", "complete_avatar_deletion_batch", "expire_introductions", "process_snail_mail_delivery"]) {
  test(`${failure} failure does not starve unrelated jobs`, async () => {
    const db = client(failure);
    const result = await runBackgroundJobs(db);
    assert.equal(result.failed_jobs.length, 1);
    assert.ok(db.calls.includes("expire_introductions"));
    assert.ok(db.calls.includes("process_snail_mail_delivery"));
    assert.ok(db.calls.includes("capture_seo_community_aggregate_snapshots"));
    assert.ok(db.calls.includes("purge_retained_data"));
    assert.ok(!JSON.stringify(result).includes("private diagnostic"));
  });
}

test("failed SEO refresh skips dependent evaluation/history but still attempts retention", async () => {
  const db = client("refresh_seo_community_aggregates");
  const result = await runBackgroundJobs(db);
  assert.deepEqual(result.failed_jobs, ["seo_refresh"]);
  assert.ok(!db.calls.includes("evaluate_seo_community_eligibility"));
  assert.ok(!db.calls.includes("capture_seo_community_aggregate_snapshots"));
  assert.ok(db.calls.includes("purge_retained_data"));
});

test("failed evaluation does not capture outdated history", async () => {
  const db = client("evaluate_seo_community_eligibility");
  assert.deepEqual((await runBackgroundJobs(db)).failed_jobs, ["seo_refresh"]);
  assert.ok(!db.calls.includes("capture_seo_community_aggregate_snapshots"));
  assert.ok(db.calls.includes("purge_retained_data"));
});

test("a failed purge remains a reported failure", async () => {
  assert.deepEqual((await runBackgroundJobs(client("purge_retained_data"))).failed_jobs, ["retention_purge"]);
});
