/* eslint-disable @typescript-eslint/no-explicit-any */
import { requireAdmin } from "../guard";
import { AdminHeader, AdminPage, StatusChip } from "../AdminChrome";

function metric(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateLabel(value: unknown) {
  if (!value) return "None pending";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "Unavailable" : date.toLocaleString();
}

function MetricCard({ label, value, note }: { label: string; value: number; note: string }) {
  return <div className="border border-black/10 bg-white/35 px-5 py-5">
    <p className="text-xs font-semibold uppercase tracking-[.12em] text-black/45">{label}</p>
    <p className="mt-3 font-serif text-3xl text-primary">{value.toLocaleString()}</p>
    <p className="mt-2 text-xs leading-5 text-black/45">{note}</p>
  </div>;
}

export default async function AdminSystem() {
  const { db } = await requireAdmin();
  const { data, error } = await db.rpc("admin_dashboard_summary");
  const metrics: any = data && typeof data === "object" ? data : {};
  const failed = metric(metrics.storage_failed);
  const pending = metric(metrics.storage_pending);
  const retrying = metric(metrics.storage_retrying);
  const maxAttempts = metric(metrics.storage_max_attempts);
  const retentionUnconfigured = metric(metrics.retention_unconfigured);
  const activeHolds = metric(metrics.active_holds);
  const healthy = !error && failed === 0 && retentionUnconfigured === 0;

  return <AdminPage>
    <AdminHeader active="system" eyebrow="Operations · Administrator only" title="System" description="Review operational cleanup, retention dependencies, and failures that need administrator attention." isAdmin>
      <StatusChip value={error ? "Unavailable" : healthy ? "Healthy" : "Attention needed"} tone={error ? "danger" : healthy ? "good" : "warn"} />
    </AdminHeader>

    {error && <p role="alert" className="notice notice-error mt-6">System status could not be loaded. Refresh before relying on these figures.</p>}

    <section className="mt-8" aria-labelledby="storage-heading">
      <div><p className="admin-eyebrow">Background cleanup</p><h2 id="storage-heading" className="section-title mt-1">Storage deletion queue</h2><p className="section-description mt-2 max-w-3xl">Operational status for storage deletion work created by account and retention cleanup.</p></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Pending" value={pending} note="Items currently due for cleanup." />
        <MetricCard label="Failed" value={failed} note="Pending items with a recorded failure." />
        <MetricCard label="Retrying" value={retrying} note="Pending items that have already been attempted." />
        <MetricCard label="Max attempts" value={maxAttempts} note="Highest retry count among pending work." />
      </div>
      <dl className="mt-5 grid gap-4 border-y border-black/10 py-5 text-sm sm:grid-cols-2">
        <div><dt className="text-black/45">Oldest pending item</dt><dd className="mt-1 font-medium text-primary">{dateLabel(metrics.storage_oldest_pending)}</dd></div>
        <div><dt className="text-black/45">Latest storage error</dt><dd className="mt-1 break-words text-primary">{metrics.storage_last_error || "No storage error recorded."}</dd></div>
      </dl>
    </section>

    <section className="mt-10 border-t border-black/10 pt-7" aria-labelledby="retention-heading">
      <div><p className="admin-eyebrow">Data lifecycle</p><h2 id="retention-heading" className="section-title mt-1">Retention dependencies</h2><p className="section-description mt-2 max-w-3xl">Read-only status for retention configuration and active holds. Policy management will remain separate from this operational view.</p></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <MetricCard label="Unconfigured policies" value={retentionUnconfigured} note="Retention policies that are disabled or missing a retention period." />
        <MetricCard label="Active holds" value={activeHolds} note="Retention holds that have not yet been released." />
      </div>
    </section>
  </AdminPage>;
}
