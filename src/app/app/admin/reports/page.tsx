/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { requireStaff } from "../guard";
import { updateAdminReportStatus } from "../actions";
import { AdminHeader, AdminPage, StatusChip, toneForStatus } from "../AdminChrome";
import { safeAdminReturnTo, withAdminReturnTo } from "../investigation-context";

const reasons = ["spam", "scam/fraud", "harassment", "sexual/inappropriate content", "hate/abuse", "fake profile/impersonation", "underage concern", "other"];
const statuses = ["open", "reviewing", "actioned", "dismissed"];
const PAGE_SIZE = 40;

function labelFor(value: unknown) {
  return String(value ?? "").replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export default async function AdminReports({ searchParams }: { searchParams: Promise<{ report?: string; status?: string; reason?: string; target_type?: string; page?: string; error?: string; updated?: string; return_to?: string }> }) {
  const { db, role } = await requireStaff();
  const filters = await searchParams;
  const returnTo = safeAdminReturnTo(filters.return_to);
  let query = db.from("reports").select("id,target_type,target_id,reason,details,status,created_at,reporter_id", { count: "exact" }).order("created_at", { ascending: false });
  if (statuses.includes(filters.status ?? "")) query = query.eq("status", filters.status);
  if (reasons.includes(filters.reason ?? "")) query = query.eq("reason", filters.reason);
  if (["profile", "introduction", "message"].includes(filters.target_type ?? "")) query = query.eq("target_type", filters.target_type);
  const page = Math.max(1, Number.parseInt(filters.page ?? "1", 10) || 1);
  const { data: reports, count: reportCount, error: reportsError } = await query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const pageCount = Math.max(1, Math.ceil(Number(reportCount ?? 0) / PAGE_SIZE));
  const listLink = (nextPage: number) => {
    const params = new URLSearchParams();
    if (filters.status) params.set("status", filters.status);
    if (filters.reason) params.set("reason", filters.reason);
    if (filters.target_type) params.set("target_type", filters.target_type);
    params.set("page", String(nextPage));
    return `/app/admin/reports?${params.toString()}`;
  };
  const { data: visibleProfiles, error: peopleError } = await db.rpc("get_discover_profiles");
  const people = new Map<string, any>((visibleProfiles ?? []).map((profile: any) => [String(profile.id), profile]));
  let detail: any = null;
  let audit: any[] = [];
  let detailError: any = null;
  let auditError: any = null;
  if (filters.report) {
    const detailResult = await db.rpc("get_report_details", { report_uuid: filters.report });
    detail = detailResult.data;
    detailError = detailResult.error;
    const auditResult = await db.from("moderation_audit_log").select("id,moderator_id,action,old_status,new_status,created_at").eq("report_id", filters.report).order("created_at", { ascending: false });
    audit = auditResult.data ?? [];
    auditError = auditResult.error;
  }
  const report = detail?.report;
  const target = detail?.profile ?? detail?.introduction ?? detail?.message;
  const targetType = report?.target_type;
  const targetUserId = report?.target_profile_id ?? (targetType === "introduction" ? target?.sender_id ?? target?.recipient_id : target?.sender_id);
  const conversationId = targetType === "introduction" ? target?.conversation_id_legacy : targetType === "message" ? target?.conversation_id : null;
  let targetUserDetail: any = null;
  let targetUserDetailError: any = null;
  if (targetUserId && role === "admin") {
    const targetUserResult = await db.rpc("admin_get_user_detail", { target_user: targetUserId });
    targetUserDetail = targetUserResult.data;
    targetUserDetailError = targetUserResult.error;
  }
  const relatedReports = targetUserDetail?.reports ?? [];
  const relatedAudit = targetUserDetail?.audit ?? [];
  const reportContext = filters.report
    ? `/app/admin/reports?report=${encodeURIComponent(filters.report)}${filters.status ? `&status=${encodeURIComponent(filters.status)}` : ""}${filters.reason ? `&reason=${encodeURIComponent(filters.reason)}` : ""}${filters.target_type ? `&target_type=${encodeURIComponent(filters.target_type)}` : ""}&page=${page}`
    : `/app/admin/reports${filters.status || filters.reason || filters.target_type ? `?${new URLSearchParams({ ...(filters.status ? { status: filters.status } : {}), ...(filters.reason ? { reason: filters.reason } : {}), ...(filters.target_type ? { target_type: filters.target_type } : {}), page: String(page) }).toString()}` : ""}`;

  return <AdminPage><AdminHeader active="reports" eyebrow="Trust & safety · Review queue" title="Reports" description="Review reported profiles and conversations with their context." backHref={returnTo ?? (role === "admin" ? "/app/admin" : "/app/moderation")} backLabel={returnTo ? "Back to investigation" : role === "admin" ? "Admin Center" : "Moderator Panel"} isAdmin={role === "admin"} accessLabel={role === "admin" ? "Admin Center" : "Moderator Panel"} />
    <form className="admin-toolbar flex flex-wrap items-end gap-3"><label className="text-sm text-black/60">Status<select name="status" defaultValue={filters.status ?? ""} className="field mt-2 block w-auto"><option value="">All statuses</option>{statuses.map((status) => <option key={status} value={status}>{labelFor(status)}</option>)}</select></label><label className="text-sm text-black/60">Reason<select name="reason" defaultValue={filters.reason ?? ""} className="field mt-2 block w-auto"><option value="">All reasons</option>{reasons.map((reason) => <option key={reason} value={reason}>{labelFor(reason)}</option>)}</select></label><label className="text-sm text-black/60">Target<select name="target_type" defaultValue={filters.target_type ?? ""} className="field mt-2 block w-auto"><option value="">All targets</option><option value="profile">Profile</option><option value="introduction">Introduction</option><option value="message">Message</option></select></label><button className="btn-primary px-4 py-2.5 text-sm">Apply filters</button></form>
    {filters.error && <p role="alert" className="notice notice-error mt-5">{filters.error}</p>}{filters.updated && <p role="status" className="notice notice-success mt-5">Report status updated.</p>}{reportsError && <p role="alert" className="notice notice-error mt-5">Reports could not be loaded. Refresh before relying on this queue.</p>}{peopleError && <p role="alert" className="notice notice-error mt-5">Reporter context could not be loaded. Refresh before relying on reporter names.</p>}{detailError && <p role="alert" className="notice notice-error mt-5">Report details could not be loaded.</p>}{auditError && <p role="alert" className="notice notice-error mt-5">Report audit history could not be loaded.</p>}{targetUserDetailError && <p role="alert" className="notice notice-error mt-5">Related account context could not be loaded.</p>}
    <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]"><section aria-label="Reports">{reportsError ? <p className="border-t border-black/10 py-10 text-sm text-red-700">Reports could not be loaded.</p> : (reports ?? []).length ? <div className="admin-table">{reports.map((item: any) => <Link key={item.id} href={`/app/admin/reports?report=${item.id}${filters.status ? `&status=${encodeURIComponent(filters.status)}` : ""}&page=${page}`} className={`admin-row block ${filters.report === item.id ? "bg-[#e9eee8]" : ""}`}><div className="flex items-center justify-between gap-3"><p className="font-semibold capitalize">{item.target_type} <span className="font-normal text-black/45">· {labelFor(item.reason)}</span></p><StatusChip value={labelFor(item.status)} tone={toneForStatus(item.status)} /></div><p className="mt-2 text-xs text-black/45">{people.get(item.reporter_id)?.display_name ?? "Restricted reporter"} · {new Date(item.created_at).toLocaleString()}</p>{item.details && <p className="mt-2 line-clamp-2 text-sm text-black/55">{item.details}</p>}</Link>)}</div> : <p className="border-t border-black/10 py-10 text-sm text-black/50">No reports match these filters.</p>}<nav className="mt-6 flex items-center justify-between border-t border-black/10 pt-4 text-sm"><span className="text-black/50">Page {page} of {pageCount}</span><div className="flex gap-4">{page > 1 && <Link href={listLink(page - 1)} className="text-brand hover:underline">Previous</Link>}{page < pageCount && <Link href={listLink(page + 1)} className="text-brand hover:underline">Next</Link>}</div></nav></section>
      {detail && <section className="border-l border-black/10 pl-8"><h2 className="section-title">Report detail</h2><dl className="mt-5 grid gap-2 border-y border-black/10 py-4 text-sm"><div className="flex justify-between gap-4"><dt className="text-black/45">Reporter</dt><dd>{people.get(report?.reporter_id)?.display_name ?? "Restricted reporter"}</dd></div><div className="flex justify-between gap-4"><dt className="text-black/45">Target</dt><dd>{targetType ?? "Unknown"}</dd></div><div className="flex justify-between gap-4"><dt className="text-black/45">Reason</dt><dd>{report?.reason ?? "—"}</dd></div><div className="flex justify-between gap-4"><dt className="text-black/45">Status</dt><dd>{report?.status ?? "—"}</dd></div></dl>{report?.case_id && <div className="mt-5 text-sm"><span className="text-black/45">Moderation case</span>{" "}<Link href={withAdminReturnTo(`/app/admin/cases/${report.case_id}`, reportContext)} className="text-brand underline">Open case →</Link></div>}{targetType === "profile" && <div className="mt-6"><h3 className="subsection-title">Reported profile</h3>{target?.username && <Link href={withAdminReturnTo(`/app/profile/${target.username}?from=admin`, reportContext)} className="mt-3 inline-block text-brand underline">{target.display_name ?? target.username} (@{target.username})</Link>}{target?.bio && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-black/70">{target.bio}</p>}{target?.quote && <p className="mt-3 font-serif text-lg text-brand">“{target.quote}”</p>}</div>}{targetType === "introduction" && <div className="mt-6"><h3 className="subsection-title">Reported introduction</h3><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-black/70">{target?.icebreaker ?? target?.body ?? "No preserved text."}</p><p className="mt-3 text-xs text-black/45">Status: {target?.status ?? "—"}</p></div>}{targetType === "message" && <div className="mt-6"><h3 className="subsection-title">Reported message</h3><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-black/70">{target?.body ?? "No preserved text."}</p><p className="mt-3 text-xs text-black/45">Sent {target?.created_at ? new Date(target.created_at).toLocaleString() : "—"}</p></div>}{conversationId && <div className="mt-6 border-t border-black/10 pt-5"><h3 className="subsection-title">Related conversation</h3><Link href={withAdminReturnTo(`/app/admin/conversations/${conversationId}?report=${report?.id}`, reportContext)} className="mt-2 inline-block text-sm text-brand hover:underline">Open privileged review →</Link></div>}{targetUserDetail?.profile?.username && <div className="mt-6 border-t border-black/10 pt-5"><h3 className="subsection-title">Related account</h3><Link href={withAdminReturnTo(`/app/admin/users/${targetUserId}`, reportContext)} className="mt-2 inline-block text-sm text-brand hover:underline">{targetUserDetail.profile.display_name ?? targetUserDetail.profile.username} · View user</Link><p className="mt-2 text-xs text-black/45">{relatedReports.length} report{relatedReports.length === 1 ? "" : "s"} involving this account · {relatedAudit.length} audit entr{relatedAudit.length === 1 ? "y" : "ies"}</p>{relatedReports.length > 1 && <div className="mt-3 border-t border-black/10 pt-3"><p className="text-xs uppercase tracking-[.1em] text-black/40">Previous reports</p>{relatedReports.filter((item: any) => item.id !== report?.id).slice(0, 3).map((item: any) => <Link key={item.id} href={withAdminReturnTo(`/app/admin/reports?report=${item.id}`, reportContext)} className="mt-2 block text-xs text-brand hover:underline">{item.reason} · {item.status}</Link>)}</div>}{relatedAudit.length > 0 && <div className="mt-3 border-t border-black/10 pt-3"><p className="text-xs uppercase tracking-[.1em] text-black/40">Recent actions</p>{relatedAudit.slice(0, 3).map((entry: any) => <p key={entry.id} className="mt-2 text-xs text-black/55">{entry.action.replaceAll("_", " ")} · {new Date(entry.created_at).toLocaleString()}</p>)}</div>}</div>}<form action={updateAdminReportStatus} className="mt-8 flex flex-wrap items-center gap-3 border-t border-black/10 pt-6"><input type="hidden" name="report_id" value={filters.report}/><label htmlFor="new-report-status" className="sr-only">New status</label><select id="new-report-status" name="status" defaultValue={report?.status === "open" ? "reviewing" : report?.status ?? "reviewing"} className="field w-auto"><option>reviewing</option><option>actioned</option><option>dismissed</option></select><button className="btn-primary px-4 py-2.5 text-sm">Update status</button></form><h3 className="mt-8 border-t border-black/10 pt-6 font-serif text-xl">Audit history</h3><div className="mt-4 space-y-3">{auditError ? <p className="text-sm text-red-700">Audit history could not be loaded.</p> : audit.length ? audit.map((entry: any) => <p key={entry.id} className="text-xs leading-5 text-black/55">{entry.action.replaceAll("_", " ")} · {entry.old_status ?? "—"} → {entry.new_status ?? "—"}<span className="block text-black/35">{new Date(entry.created_at).toLocaleString()}</span></p>) : <p className="text-sm text-black/45">No audit entries yet.</p>}</div></section>}
    </div></AdminPage>;
}
