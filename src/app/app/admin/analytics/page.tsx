/* eslint-disable @typescript-eslint/no-explicit-any */
// Analytics is intentionally a server-rendered, read-only staff surface.
import Link from "next/link";
import { requireStaff } from "../guard";
import { AdminHeader, AdminPage } from "../AdminChrome";

type DateRange = { start: string; end: string; label: string; range: "today" | "7d" | "30d" | "custom" };

function isDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function shiftDate(value: string, offset: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function dateSpan(start: string, end: string) {
  return Math.floor((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
}

function resolveRange(query: { range?: string; from?: string; to?: string }): { range: DateRange; warning?: string } {
  const today = new Date().toISOString().slice(0, 10);
  if (query.range === "custom" && isDate(query.from) && isDate(query.to)) {
    const span = dateSpan(query.from, query.to);
    if (span >= 1 && span <= 366) return { range: { start: query.from, end: query.to, label: `${query.from} – ${query.to}`, range: "custom" } };
    return { range: { start: shiftDate(today, -29), end: today, label: "Last 30 days", range: "30d" }, warning: "Choose a custom range of one to 366 days." };
  }
  if (query.range === "today") return { range: { start: today, end: today, label: "Today", range: "today" } };
  if (query.range === "7d") return { range: { start: shiftDate(today, -6), end: today, label: "Last 7 days", range: "7d" } };
  return { range: { start: shiftDate(today, -29), end: today, label: "Last 30 days", range: "30d" } };
}

function metricValue(group: any, key: string) {
  const value = Number(group?.[key]);
  return Number.isFinite(value) ? value.toLocaleString() : "—";
}

function metricNumber(group: any, key: string) {
  const value = Number(group?.[key]);
  return Number.isFinite(value) ? value : 0;
}

function changeLabel(current: any, previous: any, key: string) {
  const delta = metricNumber(current, key) - metricNumber(previous, key);
  if (delta === 0) return "No change vs previous period";
  return `${delta > 0 ? "+" : ""}${delta.toLocaleString()} vs previous period`;
}

function StatCard({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="border border-black/10 bg-white/35 px-5 py-5"><p className="text-xs font-semibold uppercase tracking-[.12em] text-black/45">{label}</p><p className="mt-3 font-serif text-3xl text-[#10231d]">{value}</p>{note && <p className="mt-2 text-xs text-black/45">{note}</p>}</div>;
}

export default async function StaffAnalytics({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  const { db, role } = await requireStaff();
  const query = await searchParams;
  const resolved = resolveRange(query);
  const { range, warning } = resolved;
  const { data, error } = await db.rpc("admin_analytics_summary", { period_start: range.start, period_end: range.end });
  const metrics: any = data && typeof data === "object" ? data : null;
  const users = metrics?.users;
  const engagement = metrics?.engagement;
  const moderation = metrics?.moderation;
  const verification = metrics?.verification;
  const previous = metrics?.previous;
  const daily = Array.isArray(metrics?.daily) ? metrics.daily : [];
  const dailyRows = daily.slice(-31);
  const hasActivity = daily.some((row: any) => ["registrations", "messages", "introductions", "snail_mail", "reports"].some((key) => Number(row?.[key] ?? 0) > 0));

  return <AdminPage>
    <AdminHeader active="analytics" eyebrow="Live operations · Read only" title="Analytics" description="View platform activity, engagement, and moderation work. Private content is not exposed." isAdmin={role === "admin"} />
    <form method="get" className="admin-toolbar flex flex-wrap items-end gap-3" aria-label="Analytics date range">
      <label className="text-sm text-black/60">Time range<select name="range" defaultValue={range.range} className="field mt-2 block w-auto"><option value="today">Today</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="custom">Custom range</option></select></label>
      <label className="text-sm text-black/60">From<input type="date" name="from" defaultValue={range.range === "custom" ? range.start : ""} className="field mt-2 block w-auto" /></label>
      <label className="text-sm text-black/60">To<input type="date" name="to" defaultValue={range.range === "custom" ? range.end : ""} className="field mt-2 block w-auto" /></label>
      <button className="btn-primary px-4 py-2.5 text-sm">Apply date range</button>
    </form>
    {warning && <p className="mt-5 border-l-2 border-amber-500 px-3 py-2 text-sm text-amber-800">{warning}</p>}
    {error ? <p role="alert" className="mt-8 border-l-2 border-red-400 px-3 py-2 text-sm text-red-700">Analytics could not be loaded. Refresh before relying on these figures.</p> : <>
      <section className="admin-section mt-8" aria-labelledby="users-heading"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="admin-eyebrow">Users</p><h2 id="users-heading" className="admin-section-title mt-1">Members and activity</h2></div><p className="text-sm text-black/50">{range.label}</p></div><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><StatCard label="Total accounts" value={metricValue(users, "total_accounts")} /><StatCard label="Active accounts" value={metricValue(users, "active_accounts")} /><StatCard label="New registrations" value={metricValue(users, "new_registrations")} note={changeLabel(users, previous, "new_registrations")} /><StatCard label="Active in period" value={metricValue(users, "active_in_period")} note="Based on last activity" /></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><StatCard label="Online now" value={metricValue(users, "online_now")} note="Last 5 minutes · available accounts" /><StatCard label="Paused accounts" value={metricValue(users, "paused_accounts")} note="Voluntary inactive mode" /></div></section>
      <section className="admin-section mt-10" aria-labelledby="engagement-heading"><div><p className="admin-eyebrow">Engagement</p><h2 id="engagement-heading" className="admin-section-title mt-1">Conversations and correspondence</h2></div><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><StatCard label="Messages sent" value={metricValue(engagement, "messages_sent")} note={changeLabel(engagement, previous, "messages_sent")} /><StatCard label="Conversations started" value={metricValue(engagement, "conversations_started")} /><StatCard label="Introductions sent" value={metricValue(engagement, "introductions_sent")} /><StatCard label="Snail Mail sent" value={metricValue(engagement, "snail_mail_sent")} note={changeLabel(engagement, previous, "snail_mail_sent")} /></div><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><StatCard label="Snail Mail delivered" value={metricValue(engagement, "snail_mail_delivered")} /><StatCard label="IM enabled" value={metricValue(engagement, "instant_messaging_enabled")} note="Current active accounts" /><StatCard label="Snail Mail enabled" value={metricValue(engagement, "snail_mail_enabled")} note="Current active accounts" /><StatCard label="Period" value={`${range.label}`} note={`${range.start} → ${range.end}`} /></div></section>
      <section className="admin-section mt-10" aria-labelledby="moderation-heading"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="admin-eyebrow">Trust &amp; safety</p><h2 id="moderation-heading" className="admin-section-title mt-1">Moderation workload</h2></div><Link href="/app/admin/cases" className="text-sm font-semibold text-[#087456] hover:underline">Open Mod Inbox →</Link></div><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><StatCard label="Reports created" value={metricValue(moderation, "reports_created")} note={changeLabel(moderation, previous, "reports_created")} /><StatCard label="Reports resolved" value={metricValue(moderation, "reports_resolved")} /><StatCard label="Automated flags" value={metricValue(moderation, "automated_flags")} /><StatCard label="Open reports" value={metricValue(moderation, "open_reports")} /><StatCard label="Open cases" value={metricValue(moderation, "open_cases")} /><StatCard label="Moderation actions" value={metricValue(moderation, "moderation_actions")} /></div></section>
      {role === "admin" && verification && <section className="admin-section mt-10" aria-labelledby="verification-heading"><div><p className="admin-eyebrow">Admin-only aggregate</p><h2 id="verification-heading" className="admin-section-title mt-1">Verification queues</h2></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><StatCard label="Verified profiles" value={metricValue(verification, "verified_profiles")} note="Current, non-revoked status" /><StatCard label="Pending age appeals" value={metricValue(verification, "pending_age_appeals")} note="Requires administrator review" /></div></section>}
      <section className="admin-section mt-10" aria-labelledby="daily-heading"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="admin-eyebrow">Daily activity</p><h2 id="daily-heading" className="admin-section-title mt-1">Activity by day</h2></div><p className="text-xs text-black/45">{daily.length > 31 ? "Showing the most recent 31 days" : "One row per day"}</p></div>{hasActivity ? <div className="admin-table mt-5 overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead className="border-b border-black/10 text-[10px] font-bold uppercase tracking-[.14em] text-black/45"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Registrations</th><th className="px-4 py-3">Messages</th><th className="px-4 py-3">Introductions</th><th className="px-4 py-3">Snail Mail</th><th className="px-4 py-3">Reports</th></tr></thead><tbody>{dailyRows.map((row: any) => <tr key={row.date} className="border-b border-black/10 last:border-b-0"><td className="px-4 py-3 font-medium">{row.date}</td><td className="px-4 py-3">{Number(row.registrations ?? 0).toLocaleString()}</td><td className="px-4 py-3">{Number(row.messages ?? 0).toLocaleString()}</td><td className="px-4 py-3">{Number(row.introductions ?? 0).toLocaleString()}</td><td className="px-4 py-3">{Number(row.snail_mail ?? 0).toLocaleString()}</td><td className="px-4 py-3">{Number(row.reports ?? 0).toLocaleString()}</td></tr>)}</tbody></table></div> : <p className="mt-5 border-y border-black/10 py-10 text-sm text-black/50">No activity was recorded in this period.</p>}</section>
    </>}
    <p className="mt-8 border-t border-black/10 pt-5 text-xs text-black/40">Read-only aggregate metrics. Staff access is role-gated; no message bodies, profile text, or user-level activity history is returned.</p>
  </AdminPage>;
}
