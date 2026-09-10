/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { requireAdmin } from "../guard";
import { AdminHeader, AdminPage, StatusChip, toneForStatus } from "../AdminChrome";

type AuditEntry = {
  id: string;
  moderator_id: string | null;
  target_user_id: string | null;
  action: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

function count(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function MetricCard({ label, value, note }: { label: string; value: number; note: string }) {
  return <div className="border border-black/10 bg-white/35 px-5 py-5">
    <p className="text-xs font-semibold uppercase tracking-[.12em] text-black/45">{label}</p>
    <p className="mt-3 font-serif text-3xl text-primary">{value.toLocaleString()}</p>
    <p className="mt-2 text-xs leading-5 text-black/45">{note}</p>
  </div>;
}

const SECURITY_ACTIONS = [
  "security_context_view",
  "verification_metadata_view",
  "external_verification_conflict",
  "external_verification_recorded",
  "external_verification_revoked",
  "deactivate_account",
  "reactivate_account",
];

export default async function AdminSecurity() {
  const { db } = await requireAdmin();
  const [{ data: summary, error: summaryError }, ...auditResults] = await Promise.all([
    db.rpc("admin_security_summary"),
    ...SECURITY_ACTIONS.map((action) => db.rpc("admin_list_audit_entries", {
      action_filter: action,
      actor_filter: null,
      page_size: 8,
      page_offset: 0,
      from_date: null,
      to_date: null,
    })),
  ]);

  const metrics: any = summary && typeof summary === "object" ? summary : {};
  const auditError = auditResults.some((result) => result.error);
  const recentEvents = auditResults
    .flatMap((result) => Array.isArray(result.data) ? result.data as AuditEntry[] : [])
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 20);
  const pressure = count(metrics.login_buckets_10_plus) + count(metrics.login_buckets_30_plus);
  const healthy = !summaryError && pressure === 0;

  return <AdminPage>
    <AdminHeader active="security" eyebrow="Trust & safety · Administrator only" title="Security" description="Review aggregate authentication protections and audited privileged security activity without exposing raw identifiers or credentials." isAdmin>
      <StatusChip value={summaryError ? "Unavailable" : healthy ? "Normal" : "Review activity"} tone={summaryError ? "danger" : healthy ? "good" : "warn"} />
    </AdminHeader>

    {summaryError && <p role="alert" className="notice notice-error mt-6">Security posture could not be loaded. Refresh before relying on these figures.</p>}

    <section className="mt-8" aria-labelledby="auth-heading">
      <div><p className="admin-eyebrow">Authentication</p><h2 id="auth-heading" className="section-title mt-1">Login protection</h2><p className="section-description mt-2 max-w-3xl">Aggregate activity from the existing hashed login-rate-limit buckets. Hashes and submitted login identifiers are never shown here.</p></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Current 5-minute buckets" value={count(metrics.login_buckets_current_window)} note="Login identifier/client buckets active in the current throttle window." />
        <MetricCard label="10+ attempts" value={count(metrics.login_buckets_10_plus)} note="Current buckets that have reached at least ten attempts." />
        <MetricCard label="30+ attempts" value={count(metrics.login_buckets_30_plus)} note="Current buckets that have reached at least thirty attempts." />
        <MetricCard label="Sessions created · 24h" value={count(metrics.sessions_created_24h)} note="Authentication sessions created during the last 24 hours." />
      </div>
    </section>

    <section className="mt-10 grid gap-4 lg:grid-cols-2" aria-label="Account protection posture">
      <article className="border border-black/10 bg-white/35 p-5 sm:p-6">
        <p className="admin-eyebrow">Account safeguards</p><h2 className="section-title mt-1">Restrictions</h2>
        <dl className="mt-5 divide-y divide-black/10 border-y border-black/10">
          <div className="flex items-center justify-between gap-4 py-3"><dt className="text-sm text-black/60">Active age restrictions</dt><dd className="subsection-title">{count(metrics.active_age_restrictions).toLocaleString()}</dd></div>
          <div className="flex items-center justify-between gap-4 py-3"><dt className="text-sm text-black/60">Pending age appeals</dt><dd><Link href="/app/admin/age-appeals" className="font-serif text-xl text-brand hover:underline">{count(metrics.pending_age_appeals).toLocaleString()}</Link></dd></div>
          <div className="flex items-center justify-between gap-4 py-3"><dt className="text-sm text-black/60">Deactivated accounts</dt><dd><Link href="/app/admin/users" className="font-serif text-xl text-brand hover:underline">{count(metrics.deactivated_accounts).toLocaleString()}</Link></dd></div>
        </dl>
      </article>
      <article className="border border-black/10 bg-white/35 p-5 sm:p-6">
        <p className="admin-eyebrow">Auth service</p><h2 className="section-title mt-1">Recent activity</h2>
        <p className="section-description mt-3">Operational volume only; raw Auth audit payloads and IP addresses are not exposed on this page.</p>
        <div className="mt-5 border-y border-black/10 py-5"><p className="section-title-large">{count(metrics.auth_audit_events_24h).toLocaleString()}</p><p className="mt-1 text-xs font-semibold uppercase tracking-[.12em] text-black/45">Auth audit events · 24h</p></div>
      </article>
    </section>

    <section className="mt-10 border-t border-black/10 pt-7" aria-labelledby="audit-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-4"><div><p className="admin-eyebrow">Accountability</p><h2 id="audit-heading" className="section-title mt-1">Recent security activity</h2></div><Link href="/app/admin/audit" className="text-sm font-semibold text-brand hover:underline">Open audit log →</Link></div>
      <p className="section-description mt-2 max-w-3xl">Privileged security-context access, verification review, account status changes, and verification lifecycle events already recorded in the moderation audit log.</p>
      {auditError && <p role="alert" className="mt-4 text-sm text-red-700">Some security audit events could not be loaded.</p>}
      {recentEvents.length ? <div className="admin-table mt-5">{recentEvents.map((entry) => <div key={entry.id} className="admin-row"><div className="flex flex-wrap items-center justify-between gap-3"><p className="font-medium capitalize">{entry.action.replaceAll("_", " ")}</p><time dateTime={entry.created_at} className="text-xs text-black/45">{new Date(entry.created_at).toLocaleString()}</time></div><div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-black/50">{entry.target_user_id ? <Link href={`/app/admin/users/${entry.target_user_id}`} className="text-brand hover:underline">Target account</Link> : <span>No target account</span>}<StatusChip value={entry.action.includes("conflict") ? "review" : "audited"} tone={entry.action.includes("conflict") ? "warn" : toneForStatus("active")} /></div></div>)}</div> : <p className="mt-5 border-y border-black/10 py-8 text-sm text-black/50">No recent security audit events.</p>}
    </section>

    <p className="mt-8 text-xs leading-5 text-black/40">Individual IP history and matching-account investigation remain inside Admin user detail, where opening security context is itself audited.</p>
  </AdminPage>;
}
