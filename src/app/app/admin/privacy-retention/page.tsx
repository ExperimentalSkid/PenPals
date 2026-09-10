/* eslint-disable @typescript-eslint/no-explicit-any */
import { requireAdmin } from "../guard";
import { AdminHeader, AdminPage, StatusChip } from "../AdminChrome";
import { createAdminRetentionHold, releaseAdminRetentionHold, setAdminRetentionPolicy } from "../actions";

const categories = [
  ["auth_security", "Auth & security"],
  ["moderation_audit", "Moderation audit"],
  ["moderation_evidence", "Moderation evidence"],
] as const;

const labelFor = (value: string) => categories.find(([key]) => key === value)?.[1] ?? value.replaceAll("_", " ");
const dateLabel = (value: string) => new Date(value).toLocaleString();

export default async function PrivacyRetentionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { db } = await requireAdmin();
  const params = await searchParams;
  const [{ data: config, error }, { data: summary }] = await Promise.all([
    db.rpc("admin_get_retention_config"),
    db.rpc("admin_dashboard_summary"),
  ]);
  const policies = Array.isArray((config as any)?.policies) ? (config as any).policies : [];
  const holds = Array.isArray((config as any)?.holds) ? (config as any).holds : [];
  const unconfigured = Number((summary as any)?.retention_unconfigured ?? 0);
  const message = typeof params.error === "string" ? params.error : null;

  return <AdminPage>
    <AdminHeader active="privacy-retention" eyebrow="Privacy · Administrator only" title="Privacy & Retention" description="Configure data-retention periods and manage audited holds that temporarily prevent eligible records from being purged." isAdmin>
      <StatusChip value={error ? "Unavailable" : unconfigured > 0 ? `${unconfigured} unconfigured` : "Configured"} tone={error ? "danger" : unconfigured > 0 ? "warn" : "good"} />
    </AdminHeader>

    {message && <p role="alert" className="notice notice-error mt-6">{message}</p>}
    {error && <p role="alert" className="notice notice-error mt-6">Retention configuration could not be loaded.</p>}

    <section className="mt-8" aria-labelledby="policies-heading">
      <div><p className="admin-eyebrow">Policies</p><h2 id="policies-heading" className="section-title mt-1">Retention periods</h2><p className="section-description mt-2 max-w-3xl">Each category remains disabled until an administrator records a period, purpose, legal basis, and explicitly enables it.</p></div>
      <div className="mt-5 grid gap-4 lg:grid-cols-3">{categories.map(([category, label]) => {
        const policy = policies.find((row: any) => row.category === category);
        return <article key={category} className="border border-black/10 bg-white/35 p-5">
          <div className="flex items-start justify-between gap-3"><h3 className="subsection-title">{label}</h3><StatusChip value={policy?.enabled ? "Enabled" : "Disabled"} tone={policy?.enabled ? "good" : "neutral"} /></div>
          {policy ? <dl className="mt-4 space-y-3 text-sm"><div><dt className="text-black/45">Retention period</dt><dd className="mt-1">{policy.retention_period || "Not set"}</dd></div><div><dt className="text-black/45">Purpose</dt><dd className="mt-1 leading-5">{policy.purpose}</dd></div><div><dt className="text-black/45">Legal basis</dt><dd className="mt-1 leading-5">{policy.legal_basis}</dd></div><div><dt className="text-black/45">Last updated</dt><dd className="mt-1">{dateLabel(policy.updated_at)}</dd></div></dl> : <p className="mt-4 text-sm text-black/45">No policy configured.</p>}
          <details className="mt-5 border-t border-black/10 pt-4"><summary className="cursor-pointer text-sm font-semibold text-brand">{policy ? "Edit policy" : "Configure policy"}</summary><form action={setAdminRetentionPolicy} className="mt-4 space-y-3"><input type="hidden" name="category" value={category}/><label className="block text-sm text-black/60">Retention period (days)<input type="number" name="days" min="1" max="36500" required className="field mt-2 w-full" /></label><label className="block text-sm text-black/60">Purpose<textarea name="purpose" maxLength={2000} required defaultValue={policy?.purpose ?? ""} className="field mt-2 min-h-20 w-full" /></label><label className="block text-sm text-black/60">Legal basis<textarea name="legal_basis" maxLength={2000} required defaultValue={policy?.legal_basis ?? ""} className="field mt-2 min-h-20 w-full" /></label><label className="flex items-center gap-2 text-sm text-black/60"><input type="checkbox" name="enabled" defaultChecked={Boolean(policy?.enabled)} className="h-4 w-4 accent-[#087456]" /> Enabled</label><button className="btn-primary px-4 py-2.5 text-sm">Save policy</button></form></details>
        </article>;
      })}</div>
    </section>

    <section className="mt-10 border-t border-black/10 pt-7" aria-labelledby="holds-heading">
      <div><p className="admin-eyebrow">Protected records</p><h2 id="holds-heading" className="section-title mt-1">Active retention holds</h2><p className="section-description mt-2 max-w-3xl">A hold can cover an entire retention category or one specific record. Creating and releasing holds is recorded in the audit log.</p></div>
      <form action={createAdminRetentionHold} className="mt-5 grid gap-3 border border-black/10 bg-white/35 p-5 lg:grid-cols-[220px_minmax(0,1fr)_minmax(0,1.3fr)_auto] lg:items-end"><label className="text-sm text-black/60">Category<select name="category" className="field mt-2 w-full">{categories.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label className="text-sm text-black/60">Record ID <span className="text-black/35">(optional)</span><input name="record_id" className="field mt-2 w-full" placeholder="UUID or leave blank for category-wide hold" /></label><label className="text-sm text-black/60">Reason<input name="reason" maxLength={2000} required className="field mt-2 w-full" placeholder="Why must this data be retained?" /></label><button className="btn-primary px-4 py-2.5 text-sm">Create hold</button></form>
      {holds.length ? <div className="admin-table mt-5">{holds.map((hold: any) => <article key={hold.id} className="admin-row"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{labelFor(hold.category)}</p><StatusChip value={hold.record_id ? "Record hold" : "Category hold"} tone="warn" /></div><p className="mt-2 text-sm leading-6 text-black/65">{hold.reason}</p><p className="mt-2 text-xs text-black/40">Started {dateLabel(hold.started_at)}{hold.record_id ? ` · Record ${hold.record_id}` : " · Entire category"}</p></div><form action={releaseAdminRetentionHold}><input type="hidden" name="hold_id" value={hold.id}/><button className="btn-secondary px-3 py-2 text-xs">Release hold</button></form></div></article>)}</div> : <p className="mt-5 border-y border-black/10 py-8 text-sm text-black/45">No active retention holds.</p>}
    </section>
  </AdminPage>;
}
