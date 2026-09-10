/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import Link from "next/link";
import { requireStaff } from "../guard";
import { AdminHeader, AdminPage, StatusChip, toneForStatus } from "../AdminChrome";

const statuses = ["all", "open", "waiting_staff", "waiting_user", "resolved", "mine", "unassigned"];
const categories = ["all", "account_access", "privacy_safety", "bug_report", "feedback", "other"];
const assignments = ["all", "mine", "unassigned"];
const sorts = ["updated_desc", "updated_asc", "created_desc", "priority_desc"];
const PAGE_SIZE = 25;

function labelFor(value: unknown) {
  const raw = String(value ?? "");
  const labels: Record<string, string> = {
    account_access: "Account access",
    privacy_safety: "Privacy & safety",
    bug_report: "Bug report",
    waiting_staff: "Waiting for staff",
    waiting_user: "Waiting for contact",
    public_contact: "Public contact",
  };
  return labels[raw] ?? raw.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function dateLabel(value: unknown) {
  return value ? new Date(String(value)).toLocaleString() : "—";
}

function priorityTone(priority: string) {
  if (priority === "urgent" || priority === "high") return "danger" as const;
  if (priority === "low") return "good" as const;
  return "neutral" as const;
}

export default async function ContactInbox({ searchParams }: { searchParams: Promise<{ status?: string; category?: string; assignment?: string; q?: string; sort?: string; page?: string; error?: string }> }) {
  const { db, role } = await requireStaff();
  const filters = await searchParams;
  const status = statuses.includes(filters.status ?? "") ? filters.status : "all";
  const category = categories.includes(filters.category ?? "") ? filters.category : "all";
  const assignment = assignments.includes(filters.assignment ?? "") ? filters.assignment : "all";
  const sort = sorts.includes(filters.sort ?? "") ? filters.sort : "updated_desc";
  const q = String(filters.q ?? "").trim().slice(0, 100);
  const page = Math.max(1, Number.parseInt(filters.page ?? "1", 10) || 1);
  const { data: rows, error } = await db.rpc("staff_list_public_contact_tickets", {
    status_filter: status === "all" ? null : status,
    category_filter: category === "all" ? null : category,
    assignment_filter: assignment === "all" ? null : assignment,
    search_query: q || null,
    sort_order: sort,
    page_size: PAGE_SIZE,
    page_offset: (page - 1) * PAGE_SIZE,
  });
  const tickets = Array.isArray(rows) ? rows : [];
  const total = Number(tickets[0]?.total_count ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const queryFor = (nextPage: number) => new URLSearchParams({
    ...(status !== "all" ? { status } : {}),
    ...(category !== "all" ? { category } : {}),
    ...(assignment !== "all" ? { assignment } : {}),
    ...(q ? { q } : {}),
    ...(sort !== "updated_desc" ? { sort } : {}),
    page: String(nextPage),
  }).toString();
  const statusHref = (nextStatus: string) => {
    const params = new URLSearchParams({
      ...(nextStatus !== "all" ? { status: nextStatus } : {}),
      ...(category !== "all" ? { category } : {}),
      ...(assignment !== "all" ? { assignment } : {}),
      ...(q ? { q } : {}),
      ...(sort !== "updated_desc" ? { sort } : {}),
    });
    return `/app/admin/contact${params.toString() ? `?${params.toString()}` : ""}`;
  };
  const statusLinks = [
    ["all", "All"],
    ["open", "Open"],
    ["waiting_staff", "Waiting for staff"],
    ["waiting_user", "Waiting for contact"],
    ["resolved", "Resolved"],
    ["mine", "Mine"],
    ["unassigned", "Unassigned"],
  ] as const;

  return <AdminPage>
    <AdminHeader active="contact" eyebrow="Public contact queue" title="Contact Inbox" description="Review messages from visitors who contacted pen-pals.net before signing in." backHref={role === "admin" ? "/app/admin" : "/app/moderation"} backLabel={role === "admin" ? "Admin Center" : "Moderator Panel"} isAdmin={role === "admin"} accessLabel={role === "admin" ? "Admin Center" : "Moderator Panel"} />
    <nav className="mt-7 flex flex-wrap gap-2 border-y border-black/10 py-4" aria-label="Contact ticket status">
      {statusLinks.map(([value, label]) => <Link key={value} href={statusHref(value)} aria-label={value === "all" ? "All contact messages" : undefined} aria-current={status === value ? "page" : undefined} className={`rounded-md border px-3 py-2 text-sm transition ${status === value ? "border-[#075d46] bg-[#075d46] font-semibold text-white" : "border-black/10 bg-white/30 text-black/65 hover:bg-white/70 hover:text-brand"}`}>{label}</Link>)}
    </nav>
    <form method="get" className="admin-toolbar grid gap-3 md:grid-cols-[repeat(2,minmax(0,auto))_minmax(0,1fr)_auto_auto] md:items-end" aria-label="Contact message filters">
      {status !== "all" && <input type="hidden" name="status" value={status} />}
      <label className="text-sm text-black/60">Topic<select name="category" defaultValue={category} className="field mt-2 block w-full">{categories.map((item) => <option key={item} value={item}>{item === "all" ? "All topics" : labelFor(item)}</option>)}</select></label>
      <label className="text-sm text-black/60">Assigned to<select name="assignment" defaultValue={assignment} className="field mt-2 block w-full">{assignments.map((item) => <option key={item} value={item}>{item === "all" ? "Everyone" : labelFor(item)}</option>)}</select></label>
      <label className="text-sm text-black/60">Search messages<input name="q" defaultValue={q} maxLength={100} className="field mt-2 w-full" placeholder="Contact ID, subject, name, or email" /></label>
      <label className="text-sm text-black/60">Sort<select name="sort" defaultValue={sort} className="field mt-2 block w-full"><option value="updated_desc">Updated newest</option><option value="updated_asc">Updated oldest</option><option value="created_desc">Created newest</option><option value="priority_desc">Priority</option></select></label>
      <button className="btn-primary px-4 py-2.5 text-sm md:col-start-5">Apply filters</button>
    </form>
    {filters.error && <p role="alert" className="notice notice-error mt-5">{filters.error}</p>}
    {error && <p role="alert" className="notice notice-error mt-5">Contact messages could not be loaded. Refresh before relying on this queue.</p>}
    <section className="admin-section mt-8" aria-label="Contact messages">
      <div className="admin-table overflow-x-auto">
        <div className="min-w-[1060px]">
          <div className="admin-table-head grid grid-cols-[110px_minmax(0,1.3fr)_minmax(0,1fr)_150px_130px_120px_145px_145px]"><span>Contact ID</span><span>Subject</span><span>From</span><span>Topic</span><span>Status</span><span>Priority</span><span>Assigned to</span><span>Updated</span></div>
          {tickets.length ? tickets.map((ticket: any) => <Link key={ticket.id} href={`/app/admin/support/${ticket.id}?return_to=${encodeURIComponent(`/app/admin/contact?${queryFor(page)}`)}`} className="admin-row block hover:text-brand"><div className="grid grid-cols-[110px_minmax(0,1.3fr)_minmax(0,1fr)_150px_130px_120px_145px_145px] items-center gap-3"><div className="font-mono text-xs font-semibold text-primary">{ticket.ticket_code}</div><div className="min-w-0"><p className="truncate font-medium text-primary">{ticket.subject}</p><p className="mt-1 text-xs text-black/45">{labelFor(ticket.ticket_type)}</p></div><div className="min-w-0"><p className="truncate text-sm">{ticket.requester_display_name || "Public contact"}</p></div><div><StatusChip value={labelFor(ticket.category)} tone="neutral" /></div><div><StatusChip value={labelFor(ticket.status)} tone={toneForStatus(ticket.status)} /></div><div><StatusChip value={labelFor(ticket.priority)} tone={priorityTone(ticket.priority)} /></div><div className="truncate text-xs text-black/50">{ticket.assigned_staff_name || "Unassigned"}</div><div className="text-xs text-black/50">{dateLabel(ticket.updated_at)}</div></div></Link>) : <div className="px-4 py-12 text-sm text-black/50"><p>{error ? "No contact message data is available." : "No contact messages match these filters."}</p><p className="mt-2 text-xs text-black/40">New public contact messages will appear here as they arrive.</p></div>}
        </div>
      </div>
    </section>
    <nav className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-black/10 pt-5 text-sm" aria-label="Contact inbox pagination"><span className="text-black/50">{total ? `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total} messages` : "0 messages"}</span><div className="flex items-center gap-2"><span className="sr-only">Page navigation</span>{page > 1 ? <Link href={`/app/admin/contact?${queryFor(page - 1)}`} aria-label="Previous page" className="rounded-md border border-black/10 px-3 py-2 text-brand hover:bg-white/70">←</Link> : <span aria-disabled="true" aria-label="Previous page" className="rounded-md border border-black/10 px-3 py-2 text-black/25">←</span>}<span aria-current="page" className="rounded-md bg-[#075d46] px-3 py-2 font-semibold text-white">{page}</span>{page < pageCount ? <Link href={`/app/admin/contact?${queryFor(page + 1)}`} aria-label="Next page" className="rounded-md border border-black/10 px-3 py-2 text-brand hover:bg-white/70">→</Link> : <span aria-disabled="true" aria-label="Next page" className="rounded-md border border-black/10 px-3 py-2 text-black/25">→</span>}<span className="ml-3 rounded-md border border-black/10 px-3 py-2 text-black/55">25 per page</span></div></nav>
  </AdminPage>;
}
