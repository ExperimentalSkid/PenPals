/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import Link from "next/link";
import { requireAdmin } from "../guard";
import { reviewAgeAppeal } from "./actions";
import AgeAppealDecision from "./AgeAppealDecision";
import { AdminHeader, AdminPage, StatusChip, toneForStatus } from "../AdminChrome";

// Approve correction is rendered in the client confirmation boundary below.

function dateLabel(value: string | null) { return value ? new Date(value).toLocaleString() : "—"; }

export default async function AdminAgeAppeals({ searchParams }: { searchParams: Promise<{ status?: string; error?: string; updated?: string; page?: string }> }) {
  const { db } = await requireAdmin();
  const query = await searchParams;
  const status = ["pending", "approved", "rejected", "all"].includes(query.status ?? "") ? query.status : "pending";
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const pageSize = 40;
  const { data: appeals, error } = await db.rpc("admin_list_age_appeals_page", { status_filter: status, page_size: pageSize, page_offset: (page - 1) * pageSize });
  const totalCount = Number(appeals?.[0]?.total_count ?? 0);
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const pageLink = (nextPage: number) => `/app/admin/age-appeals?status=${encodeURIComponent(status ?? "pending")}&page=${nextPage}`;
  return <AdminPage>
    <AdminHeader active="age-appeals" eyebrow="Trust & safety · Restricted access" title="Age appeals" description="Review correction requests without exposing protected email or risk data." isAdmin />
    <form className="admin-toolbar flex flex-wrap items-end gap-3"><label className="text-sm text-black/60">Status<select name="status" defaultValue={status} className="field mt-2 block w-auto"><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="all">All</option></select></label><button className="btn-primary px-4 py-2.5 text-sm">Apply filters</button></form>
    {query.error && <p role="alert" className="notice notice-error mt-5">{query.error}</p>}{query.updated && <p role="status" className="notice notice-success mt-5">Appeal updated and audited.</p>}{error && <p role="alert" className="notice notice-error mt-8">Appeals could not be loaded.</p>}
    <section className="admin-section mt-8">{(appeals ?? []).length ? appeals.map((appeal: any) => <article key={appeal.id} className="border-b border-black/10 py-7 first:border-t"><div className="flex flex-wrap items-baseline justify-between gap-4"><h2 className="section-title">Correction request</h2><StatusChip value={appeal.status} tone={toneForStatus(appeal.status)} /></div><dl className="mt-5 grid gap-3 border-y border-black/10 py-5 text-sm sm:grid-cols-2 lg:grid-cols-4"><div><dt className="text-black/45">Submitted</dt><dd className="mt-1">{dateLabel(appeal.submitted_at)}</dd></div><div><dt className="text-black/45">Corrected age</dt><dd className="mt-1">{appeal.resulting_age}</dd></div><div><dt className="text-black/45">Restriction until</dt><dd className="mt-1">{appeal.blocked_until ?? "—"}</dd></div><div><dt className="text-black/45">Source</dt><dd className="mt-1">{appeal.restriction_source ?? "—"}</dd></div></dl>{appeal.explanation && <p className="mt-5 max-w-2xl whitespace-pre-wrap text-sm leading-6 text-black/65">{appeal.explanation}</p>}{Array.isArray(appeal.previous_appeals) && appeal.previous_appeals.length > 0 && <p className="mt-4 text-xs text-black/45">Previous requests: {appeal.previous_appeals.length}</p>}{appeal.status === "pending" && <AgeAppealDecision appealId={appeal.id} action={reviewAgeAppeal} />}</article>) : <p className="border-t border-black/10 py-10 text-sm text-black/50">No age appeals match this filter.</p>}<nav className="flex items-center justify-between border-t border-black/10 py-4 text-sm"><span className="text-black/50">Page {page} of {pageCount}</span><div className="flex gap-4">{page > 1 && <Link href={pageLink(page - 1)} className="text-brand hover:underline">Previous</Link>}{page < pageCount && <Link href={pageLink(page + 1)} className="text-brand hover:underline">Next</Link>}</div></nav></section>
  </AdminPage>;
}
