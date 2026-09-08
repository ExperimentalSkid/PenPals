/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import Link from "next/link";
import { requireAdmin } from "../guard";
import { AdminHeader, AdminPage, StatusChip, toneForStatus } from "../AdminChrome";
import { safeAdminReturnTo, withAdminReturnTo } from "../investigation-context";

const statuses = ["open", "resolved", "dismissed"];
const PAGE_SIZE = 30;

function labelFor(value: unknown) {
  return String(value ?? "").replaceAll("_", " ");
}

function dateLabel(value: unknown) {
  return value ? new Date(String(value)).toLocaleString() : "—";
}

export default async function AdminInbox({ searchParams }: { searchParams: Promise<{ status?: string; page?: string; error?: string; return_to?: string }> }) {
  const { db } = await requireAdmin();
  const filters = await searchParams;
  const returnTo = safeAdminReturnTo(filters.return_to);
  const status = statuses.includes(filters.status ?? "") ? filters.status : "open";
  const page = Math.max(1, Number.parseInt(filters.page ?? "1", 10) || 1);
  const { data: rows, error } = await db.rpc("admin_list_escalated_moderation_cases", {
    status_filter: status,
    page_size: PAGE_SIZE,
    page_offset: (page - 1) * PAGE_SIZE,
  });
  const cases = Array.isArray(rows) ? rows : [];
  const total = Number(cases[0]?.total_count ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const listHref = (nextPage: number) => `/app/admin/inbox?${new URLSearchParams({ status, page: String(nextPage) }).toString()}`;
  const queueContext = `/app/admin/inbox?${new URLSearchParams({ status, page: String(page) }).toString()}`;

  return <AdminPage>
    <AdminHeader active="admin-inbox" eyebrow="Trust & safety · Administrator queue" title="Admin Inbox" description="Review moderator escalations with the original evidence and audit history." backHref={returnTo ?? "/app/admin"} backLabel={returnTo ? "Back to investigation" : "Admin Center"} isAdmin>
      <span className="admin-status admin-status-warn">Administrator only</span>
    </AdminHeader>
    <form className="admin-toolbar flex flex-wrap items-end gap-3" aria-label="Admin escalation filters">
      <label className="text-sm text-black/60">Status<select name="status" defaultValue={status} className="field mt-2 block w-auto"><option value="open">Open escalations</option><option value="resolved">Resolved</option><option value="dismissed">Dismissed</option></select></label>
      <button className="btn-primary px-4 py-2.5 text-sm">Apply inbox filter</button>
    </form>
    {filters.error && <p role="alert" className="mt-5 border-l-2 border-red-400 px-3 py-2 text-sm text-red-700">{filters.error}</p>}
    {error && <p role="alert" className="mt-5 border-l-2 border-red-400 px-3 py-2 text-sm text-red-700">The Admin Inbox could not be loaded.</p>}
    <section className="admin-section mt-8" aria-label="Escalated moderation cases">
      {cases.length ? <div className="admin-table">
        <div className="admin-table-head md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_180px]"><span>Case / target</span><span>Escalation</span><span>Priority · status</span></div>
        {cases.map((item: any) => <Link key={item.id} href={withAdminReturnTo(`/app/admin/cases/${item.id}`, queueContext)} className="admin-row block">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_180px] md:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-3"><p className="font-serif text-xl text-[#10231d]">{item.subject_display_name || item.subject_username || "Unidentified account"}</p><StatusChip value={labelFor(item.status)} tone={toneForStatus(item.status)} /></div>
              <p className="mt-1 text-sm text-black/60">{labelFor(item.primary_target_type)} · {item.report_count} report{item.report_count === 1 ? "" : "s"} · Case {String(item.id).slice(0, 8)}</p>
            </div>
            <div className="text-sm"><p className="font-medium text-[#10231d]">{item.escalation_reason || "Reason not recorded"}</p><p className="mt-1 text-xs text-black/50">Escalated by {item.escalated_by_name || "Staff member"} · {dateLabel(item.escalated_at)}</p></div>
            <div className="text-xs text-black/50"><p className="font-semibold text-[#10231d]">Priority {item.priority}</p><p className="mt-1">{item.assigned_staff_name ? `Owned by ${item.assigned_staff_name}` : "Unassigned"}</p><p className="mt-1 text-[#087456]">Open full case →</p></div>
          </div>
        </Link>)}
      </div> : <div className="border-y border-black/10 py-12 text-sm text-black/50"><p>{status === "open" ? "No open administrator escalations." : `No ${status} escalations found.`}</p><p className="mt-2 text-xs text-black/40">Moderator escalations appear here after a moderator provides a reason. Closed cases remain in the case history.</p></div>}
    </section>
    <nav className="mt-8 flex items-center justify-between border-t border-black/10 pt-5 text-sm" aria-label="Admin Inbox pagination"><span className="text-black/50">Page {page} of {pageCount}</span><div className="flex gap-4">{page > 1 && <Link href={listHref(page - 1)} className="text-[#087456] hover:underline">Previous</Link>}{page < pageCount && <Link href={listHref(page + 1)} className="text-[#087456] hover:underline">Next</Link>}</div></nav>
  </AdminPage>;
}
