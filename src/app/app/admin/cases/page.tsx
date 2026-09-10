/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { requireStaff } from "../guard";
import { AdminHeader, AdminPage, StatusChip, toneForStatus } from "../AdminChrome";
import { safeAdminReturnTo, withAdminReturnTo } from "../investigation-context";

const statuses = ["new", "triage", "investigating", "waiting", "resolved", "dismissed"];
const PAGE_SIZE = 30;

function labelFor(value: unknown) {
  return String(value ?? "").replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export default async function AdminCases({ searchParams }: { searchParams: Promise<{ status?: string; page?: string; error?: string; return_to?: string }> }) {
  const { db, role } = await requireStaff();
  const filters = await searchParams;
  const returnTo = safeAdminReturnTo(filters.return_to);
  const status = statuses.includes(filters.status ?? "") ? filters.status : null;
  const page = Math.max(1, Number.parseInt(filters.page ?? "1", 10) || 1);
  const { data: rows, error } = await db.rpc("admin_list_moderation_cases", {
    status_filter: status,
    assigned_filter: null,
    page_size: PAGE_SIZE,
    page_offset: (page - 1) * PAGE_SIZE,
  });
  const cases = Array.isArray(rows) ? rows : [];
  const total = Number(cases[0]?.total_count ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const linkFor = (nextPage: number) => `/app/admin/cases?${new URLSearchParams({ ...(status ? { status } : {}), page: String(nextPage) }).toString()}`;
  const queueContext = `/app/admin/cases?${new URLSearchParams({ ...(status ? { status } : {}), page: String(page) }).toString()}`;

  return <AdminPage>
    <AdminHeader active="cases" eyebrow="Trust & safety · Moderation" title="Cases" description="Review moderation cases, related reports, ownership, and history." backHref={returnTo ?? (role === "admin" ? "/app/admin" : "/app/moderation")} backLabel={returnTo ? "Back to investigation" : role === "admin" ? "Admin Center" : "Moderator Panel"} isAdmin={role === "admin"} accessLabel={role === "admin" ? "Admin Center" : "Moderator Panel"} />
    <form className="admin-toolbar flex flex-wrap items-end gap-3"><label className="text-sm text-black/60">Status<select name="status" defaultValue={status ?? ""} className="field mt-2 block w-auto"><option value="">All cases</option>{statuses.map((item) => <option key={item} value={item}>{labelFor(item)}</option>)}</select></label><button className="btn-primary px-4 py-2.5 text-sm">Apply filters</button></form>
    {filters.error && <p role="alert" className="notice notice-error mt-5">{filters.error}</p>}{error && <p role="alert" className="notice notice-error mt-5">The case queue could not be loaded.</p>}
    <section className="admin-section mt-8" aria-label="Moderation cases">{cases.length ? <div className="admin-table"><div className="admin-table-head md:grid md:grid-cols-[minmax(0,1fr)_140px_170px]"><span>Case / target</span><span>Priority &amp; source</span><span>Owner · updated</span></div>{cases.map((item: any) => <Link key={item.id} href={withAdminReturnTo(`/app/admin/cases/${item.id}`, queueContext)} className="admin-row"><div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_140px_170px] md:items-center"><div><div className="flex flex-wrap items-center gap-3"><p className="subsection-title">{item.subject_display_name || item.subject_username || "Unidentified account"}</p><StatusChip value={item.status} tone={toneForStatus(item.status)} />{item.needs_admin_review && item.status !== "resolved" && item.status !== "dismissed" && <span className="admin-status admin-status-warn">Admin attention</span>}</div><p className="mt-1 text-sm text-black/60">{item.primary_target_type ?? "Report"} · {item.report_count} report{item.report_count === 1 ? "" : "s"} · {item.independent_reporter_count} independent</p></div><div className="text-sm"><p className="font-semibold text-primary">Priority {item.priority}</p><p className="mt-1 text-xs text-black/45">{item.source === "automated_flag" ? `${item.automated_flag_count ?? 0} automated flag${item.automated_flag_count === 1 ? "" : "s"}` : item.source === "mixed" ? "Human + automated" : "Human report"}</p></div><div className="text-xs text-black/50"><p>{item.assigned_staff_name ? `Owned by ${item.assigned_staff_name}` : "Unassigned"}</p><p className="mt-1">{new Date(item.updated_at).toLocaleString()}</p></div></div></Link>)}</div> : <p className="border-t border-black/10 py-10 text-sm text-black/50">No cases match these filters.</p>}</section>
    <nav className="mt-8 flex items-center justify-between border-t border-black/10 pt-5 text-sm" aria-label="Case pagination"><span className="text-black/50">Page {page} of {pageCount}</span><div className="flex gap-4">{page > 1 && <Link href={linkFor(page - 1)} className="text-brand hover:underline">Previous</Link>}{page < pageCount && <Link href={linkFor(page + 1)} className="text-brand hover:underline">Next</Link>}</div></nav>
    <p className="mt-5 text-xs text-black/40">{role === "admin" ? "Administrators can reassign cases." : "Claimed cases stay assigned for a short time so work doesn&apos;t get stuck."}</p>
  </AdminPage>;
}
