/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { notFound } from "next/navigation";
import { requireStaff } from "../../guard";
import { AdminHeader, AdminPage } from "../../AdminChrome";
import { caseContextHref, safeAdminReturnTo } from "../../investigation-context";

function ageFor(date: string | null) {
  if (!date) return null;
  const birth = new Date(date);
  const now = new Date();
  return now.getFullYear() - birth.getFullYear() - ((now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) ? 1 : 0);
}

export default async function AdminConversationReview({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ user?: string; report?: string; case?: string; return_to?: string; reason?: string; error?: string; focus?: string }> }) {
  const { db, role } = await requireStaff();
  const { id } = await params;
  const context = await searchParams;
  const isAdmin = role === "admin";
  const targetUserId = isAdmin ? context.user ?? null : null;
  const reportId = context.report ?? null;
  const caseId = context.case ?? null;
  const returnTo = safeAdminReturnTo(context.return_to);
  const accessReason = context.reason?.trim() ?? "";
  const focusTarget = /^message-[0-9a-f-]{36}$/i.test(context.focus ?? "") ? context.focus ?? null : null;
  const reviewPath = "/app/admin/conversations/" + encodeURIComponent(id);
  const preservedParams = new URLSearchParams();
  if (caseId) preservedParams.set("case", caseId);
  if (returnTo) preservedParams.set("return_to", returnTo);
  const preservedQuery = preservedParams.toString();
  const reasonAction = reviewPath + (focusTarget ? "?focus=" + encodeURIComponent(focusTarget) + (preservedQuery ? "&" + preservedQuery : "") : preservedQuery ? "?" + preservedQuery : "") + (focusTarget ? "#" + focusTarget : "");
  const backHref = returnTo ?? (caseId ? caseContextHref(caseId) : reportId ? `/app/admin/reports?report=${encodeURIComponent(reportId)}` : targetUserId ? `/app/admin/users/${encodeURIComponent(targetUserId)}` : "/app/admin");
  const backLabel = returnTo ? "Back to investigation" : caseId ? "Back to case" : reportId ? "Back to related report" : targetUserId ? "Back to related user" : "Admin Center";
  if (accessReason.length < 10) {
    return <AdminPage><AdminHeader active="reports" eyebrow="Privileged moderation access" title="Reason required" description="Enter a meaningful reason before opening this read-only conversation. The access will be recorded in the moderation audit log." backHref={backHref} backLabel={backLabel} isAdmin={isAdmin} /><form method="get" action={reasonAction} className="mt-8 max-w-xl"><input type="hidden" name={reportId ? "report" : "user"} value={reportId ?? targetUserId ?? ""}/><label htmlFor="review-reason" className="text-sm text-black/60">Reason (at least 10 characters)</label><textarea id="review-reason" name="reason" minLength={10} maxLength={200} required className="field mt-2 min-h-28 w-full" placeholder="e.g. Investigating a reported safety concern"/>{context.error && <p role="alert" className="mt-3 text-sm text-red-700">{context.error}</p>}<button className="btn-primary mt-4 px-4 py-2.5 text-sm">Open conversation review</button></form></AdminPage>;
  }
  const { data: review, error } = await db.rpc("admin_get_conversation_review", {
    conversation_uuid: id,
    target_user_id: targetUserId,
    report_uuid: reportId,
    access_reason: accessReason,
  });
  if (error || !review?.conversation) notFound();
  const participants = Array.isArray(review.participants) ? review.participants : [];
  const messages = Array.isArray(review.messages) ? review.messages : [];

  return <AdminPage>
    <AdminHeader active="reports" eyebrow="Privileged moderation access" title="Conversation review" description="Read-only access. This review has been recorded in the moderation audit log." backHref={backHref} backLabel={backLabel} isAdmin={isAdmin} />
    <div className="max-w-4xl">
      <section className="mt-8 border-b border-black/10 pb-7"><h2 className="font-serif text-2xl text-[#10231d]">Participants</h2><div className="mt-4 flex flex-wrap gap-x-8 gap-y-3">{participants.map((participant: any) => <div key={participant.id}><p className="font-medium">{participant.display_name || participant.username || "Deleted user"}{ageFor(participant.birth_date) !== null ? `, ${ageFor(participant.birth_date)}` : ""}</p>{participant.username ? <p className="mt-1 text-xs text-black/50">@{participant.username}{participant.deactivated ? " · deactivated" : ""}</p> : <p className="mt-1 text-xs text-black/50">Deleted account</p>}</div>)}</div></section>
      <section className="mt-8" aria-label="Conversation messages"><div className="flex items-baseline justify-between gap-4"><h2 className="font-serif text-2xl text-[#10231d]">Message history</h2><span className="text-xs uppercase tracking-[.12em] text-black/45">Read only</span></div>{messages.length ? <div className="mt-4 divide-y divide-black/10 border-y border-black/10">{messages.map((message: any) => <article id={`message-${message.id}`} key={message.id} className={focusTarget === "message-" + message.id ? "border-l-2 border-[#087456] bg-[#f2f6f0] py-5 pl-4" : "py-5"} aria-current={focusTarget === "message-" + message.id ? "location" : undefined}><div className="flex flex-wrap items-baseline justify-between gap-3"><p className="font-medium">{message.sender_display_name || message.sender_username || "Deleted user"}</p><time dateTime={message.created_at} className="text-xs text-black/45">{new Date(message.created_at).toLocaleString()}</time></div><p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-black/75">{message.body}</p></article>)}</div> : <p className="mt-4 border-y border-black/10 py-10 text-sm text-black/50">No messages in this conversation.</p>}</section>
      <p className="mt-8 text-xs leading-5 text-black/40">Context: {reportId ? "moderation report review" : "administrator user-detail review"}. No message edits or sends are available here.</p>
    </div>
  </AdminPage>;
}
