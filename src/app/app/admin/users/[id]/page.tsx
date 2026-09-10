import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAdmin } from "../../guard";
import LanguageFlag from "@/app/components/LanguageFlag";
import AdminUserActions from "./AdminUserActions";
import AdminProfileContentActions from "./AdminProfileContentActions";
import AdminProfileBadgeActions from "./AdminProfileBadgeActions";
import { AdminNav, StatusChip } from "../../AdminChrome";
import { safeAdminReturnTo, withAdminReturnTo } from "../../investigation-context";
import { verificationDisplayLabel, verificationDisplayState } from "@/lib/verification/display";

type AdminProfile = {
  id: string;
  username: string;
  display_name: string;
  birth_date: string | null;
  city: string | null;
  country: string | null;
  role: string;
  deactivated_at: string | null;
  last_active_at: string | null;
  created_at: string | null;
  availability: string | null;
  profile_visibility: string | null;
  show_city: boolean;
  show_activity_status: boolean;
  show_response_rate: boolean;
  accepting_new_conversations: boolean;
  profile_complete: boolean;
  has_photo: boolean;
  bio: string | null;
  quote: string | null;
  looking_for: string | null;
};

type AdminLanguage = { name: string; purpose: string; proficiency: string };
type AdminInterest = { name: string };
type AdminReport = { id: string; target_type: string; reason: string; status: string; created_at: string };
type AdminAudit = {
  id: string;
  action: string;
  old_status: string | null;
  new_status: string | null;
  created_at: string;
  report_id?: string | null;
};
type SecurityIpEntry = { ip_address: string; action: string; created_at: string };
type SecurityAccount = { id: string; username: string; display_name: string; created_at: string; deactivated_at: string | null; report_count: number };
type SecurityContext = { registration_ip: string | null; last_ip: string | null; ip_history: SecurityIpEntry[]; other_accounts: SecurityAccount[] };
type RemovedContentType = "bio" | "quote" | "avatar";
type RawRemovedContentType = RemovedContentType | "looking_for";
type RemovedContent = { id: string; content_type: RemovedContentType; previous_value: string | null; reason: string; created_at: string; restored_at?: string | null };
type VerificationRecord = { provider: string; status: string; created_at?: string | null; verified_at?: string | null; revoked_at?: string | null; reverify_after?: string | null };
type VerificationConflict = { provider?: string | null; conflict_role?: string | null; created_at?: string | null };
type VerificationContext = { records: VerificationRecord[]; conflicts: VerificationConflict[] };
type RankMetrics = { rank?: string; current_score?: number; lifetime_score?: number; distinct_active_days?: number; active_months?: number; last_meaningful_activity?: string | null; inactivity_days?: number; decay_score?: number; is_frozen?: boolean; frozen_at?: string | null };
type ConversationParticipant = { id: string; username: string | null; display_name: string | null; birth_date: string | null; deactivated?: boolean };
type AdminConversation = { id: string; created_at: string; updated_at: string; last_message_at: string | null; participants: ConversationParticipant[] };
type AdminCase = { id: string; status: string; priority: number; report_count: number; updated_at: string };
type SupportTicketSummary = { id: string; ticket_number: number; requester_id: string | null; subject: string; category: string; status: string; priority: string; created_at: string; updated_at: string };
type AdminUserDetail = { profile: AdminProfile; languages?: AdminLanguage[]; interests?: AdminInterest[]; reports?: AdminReport[]; audit?: AdminAudit[] };

function ageFor(date: string | null) {
  if (!date) return null;
  const birth = new Date(date);
  const now = new Date();
  return now.getFullYear() - birth.getFullYear() - ((now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) ? 1 : 0);
}

function dateLabel(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

export default async function AdminUserDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; updated?: string; conversation_reason?: string; return_to?: string }> }) {
  const { db, uid } = await requireAdmin();
  const { id } = await params;
  const query = await searchParams;
  const returnTo = safeAdminReturnTo(query.return_to);
  const conversationReason = query.conversation_reason?.trim() ?? "";
  const userDetailPath = `/app/admin/users/${encodeURIComponent(id)}`;
  const userContextHref = (anchor?: string) => `${userDetailPath}${conversationReason ? `?conversation_reason=${encodeURIComponent(conversationReason)}` : ""}${anchor ? `#${anchor}` : ""}`;
  const { data: rawDetail, error } = await db.rpc("admin_get_user_detail", { target_user: id });
  const detail = rawDetail as unknown as AdminUserDetail | null;
  if (error || !detail?.profile) notFound();
  const { error: accessLogError } = await db.rpc("admin_log_user_detail_access", { target_user_id: id, access_reason: "admin_user_detail" });
  if (accessLogError) redirect(`/app/admin/users?error=${encodeURIComponent("User detail could not be opened because the access audit could not be recorded.")}`);
  const [{ data: securityContext, error: securityError }, { data: contentHistory, error: contentHistoryError }, { data: userCases, error: userCasesError }, { data: supportTicketRows, error: supportTicketsError }, { data: verificationContext, error: verificationError }, { data: activityRankMetrics, error: activityRankError }, { data: profileBadges }] = await Promise.all([
    db.rpc("admin_get_user_security_context", { target_user: id }),
    db.rpc("admin_get_profile_content_history", { target_user: id }),
    db.rpc("admin_list_user_cases", { target_user: id }),
    db.rpc("staff_list_support_tickets", { status_filter: null, category_filter: null, assignment_filter: null, search_query: detail.profile.username, sort_order: "updated_desc", page_size: 100, page_offset: 0 }),
    db.rpc("admin_get_user_verification", { target_user: id }),
    db.rpc("admin_get_activity_rank_metrics", { target_user: id }),
    db.rpc("admin_get_profile_badges", { target_user: id }),
  ]);
  const profile = detail.profile;
  const languages = Array.isArray(detail.languages) ? detail.languages : [];
  const interests = Array.isArray(detail.interests) ? detail.interests : [];
  const reports = Array.isArray(detail.reports) ? detail.reports : [];
  const audit = Array.isArray(detail.audit) ? detail.audit : [];
  const security = securityContext as unknown as SecurityContext | null;
  const ipHistory = security?.ip_history ?? [];
  const otherAccounts = security?.other_accounts ?? [];
  const removedContent = Array.isArray(contentHistory)
    ? (contentHistory as unknown as Array<Omit<RemovedContent, "content_type"> & { content_type: RawRemovedContentType }>).filter((entry) => entry.content_type !== "looking_for").map((entry) => entry as RemovedContent)
    : [];
  const verification = verificationContext as unknown as VerificationContext | null;
  const verificationRecords = verification?.records ?? [];
  const verificationConflicts = verification?.conflicts ?? [];
  const verificationState = verificationDisplayState(verificationRecords);
  const rankMetrics = activityRankError ? null : activityRankMetrics as unknown as RankMetrics | null;
  let conversationData: AdminConversation[] = [];
  let conversationError: unknown = null;
  if (conversationReason.length >= 10) {
    const conversationResult = await db.rpc("admin_list_user_conversations", { target_user_id: id, access_reason: conversationReason });
    conversationData = Array.isArray(conversationResult.data) ? conversationResult.data as unknown as AdminConversation[] : [];
    conversationError = conversationResult.error;
  }
  const conversations = conversationData;
  const cases = Array.isArray(userCases) ? userCases as unknown as AdminCase[] : [];
  const supportTickets = Array.isArray(supportTicketRows)
    ? (supportTicketRows as unknown as SupportTicketSummary[]).filter((ticket) => ticket.requester_id === id)
    : [];
  const age = ageFor(profile.birth_date);
  // Badge management is an optional profile control; a read failure must not
  // hide or invalidate the rest of the privileged account context.
  const contextLoadError = Boolean(securityError || contentHistoryError || userCasesError || supportTicketsError || verificationError || activityRankError || conversationError);

  return <main className="admin-page"><div className="admin-content">
      <div className="flex flex-wrap items-center justify-between gap-4"><Link href={returnTo ?? "/app/admin/users"} className="admin-back-link">← {returnTo ? "Back to investigation" : "Users"}</Link><span className="admin-access-label">Privileged account context</span></div>
      {query.error && <p role="alert" className="notice notice-error mt-6">{query.error}</p>}
      {query.updated && <p role="status" className="notice notice-success mt-6">{query.updated === "badge" ? "Profile badge updated." : "Account updated."}</p>}
      {contextLoadError && <p role="alert" className="notice notice-error mt-6">Some account context could not be loaded. Refresh before relying on these details.</p>}
      <header className="mt-8 border-b border-black/10 pb-8"><p className="admin-eyebrow">User detail · Privileged context</p><div className="mt-3 flex flex-wrap items-end justify-between gap-6"><div><h1 className="font-serif text-5xl tracking-[-0.02em] text-primary">{profile.display_name || profile.username}{age !== null ? `, ${age}` : ""}</h1><p className="mt-2 text-base text-black/60">@{profile.username} · {profile.city}, {profile.country}</p></div><div className="flex flex-wrap gap-2"><StatusChip value={profile.role} tone={profile.role === "admin" ? "good" : "neutral"} /><StatusChip value={profile.deactivated_at ? "deactivated" : "active"} tone={profile.deactivated_at ? "danger" : "good"} /><StatusChip value={profile.profile_complete ? "complete" : "incomplete"} tone={profile.profile_complete ? "good" : "warn"} /></div></div></header>
      <AdminNav active="users" />
      <div className="mt-10 grid gap-12 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-10">
          <section><h2 className="section-title">Account context</h2><dl className="mt-4 grid gap-3 border-y border-black/10 py-5 text-sm sm:grid-cols-2"><div><dt className="text-black/45">Created</dt><dd className="mt-1">{dateLabel(profile.created_at)}</dd></div><div><dt className="text-black/45">Last active</dt><dd className="mt-1">{dateLabel(profile.last_active_at)}</dd></div><div><dt className="text-black/45">Availability</dt><dd className="mt-1">{profile.availability ?? "available"}</dd></div><div><dt className="text-black/45">Privacy</dt><dd className="mt-1">{profile.profile_visibility} · city {profile.show_city ? "shown" : "hidden"}</dd></div><div><dt className="text-black/45">Activity visibility</dt><dd className="mt-1">{profile.show_activity_status ? "Shown" : "Hidden"}</dd></div><div><dt className="text-black/45">New introductions</dt><dd className="mt-1">{profile.accepting_new_conversations ? "Accepted" : "Closed"}</dd></div></dl></section>
          <section><h2 className="section-title">Activity rank</h2><p className="section-description mt-3">Internal participation metrics for operational review. These values are not exposed to profile viewers.</p>{activityRankError && <p className="mt-4 text-sm text-red-700">Activity rank metrics could not be loaded.</p>}<dl className="mt-4 grid gap-3 border-y border-black/10 py-5 text-sm sm:grid-cols-2"><div><dt className="text-black/45">Rank</dt><dd className="mt-1">{rankMetrics?.rank ?? (activityRankError ? "—" : "Passing Notes")}</dd></div><div><dt className="text-black/45">Current score</dt><dd className="mt-1">{rankMetrics?.current_score ?? (activityRankError ? "—" : "0")}</dd></div><div><dt className="text-black/45">Lifetime score</dt><dd className="mt-1">{rankMetrics?.lifetime_score ?? (activityRankError ? "—" : "0")}</dd></div><div><dt className="text-black/45">Active days / months</dt><dd className="mt-1">{rankMetrics?.distinct_active_days ?? (activityRankError ? "—" : "0")} / {rankMetrics?.active_months ?? (activityRankError ? "—" : "0")}</dd></div><div><dt className="text-black/45">Last meaningful activity</dt><dd className="mt-1">{dateLabel(rankMetrics?.last_meaningful_activity ?? null)}</dd></div><div><dt className="text-black/45">Inactivity / decay</dt><dd className="mt-1">{rankMetrics?.inactivity_days ?? (activityRankError ? "—" : "0")} days · {rankMetrics?.decay_score ?? (activityRankError ? "—" : "0")}</dd></div><div><dt className="text-black/45">Frozen</dt><dd className="mt-1">{rankMetrics?.is_frozen ? `Yes · ${dateLabel(rankMetrics.frozen_at ?? null)}` : activityRankError ? "—" : "No"}</dd></div></dl></section>
          <section><h2 className="section-title">External verification</h2>{!verificationError && <div className="mt-3"><StatusChip value={`Current: ${verificationDisplayLabel(verificationState)}`} tone={verificationState === "verified" ? "good" : verificationState === "not-verified" ? "neutral" : "warn"} /></div>}<p className="section-description mt-3">Private verification metadata for abuse investigation. Provider identity data is restricted to administrators; raw external identifiers and account metadata are never shown.</p>{verificationError ? <p className="mt-4 text-sm text-red-700">External verification metadata could not be loaded.</p> : verificationRecords.length ? <div className="mt-4 divide-y divide-black/10 border-y border-black/10">{verificationRecords.map((record, index) => <div key={`${record.provider}-${record.created_at ?? index}`} className="grid gap-3 py-4 text-sm sm:grid-cols-2"><div><p className="font-medium">{record.provider}</p><p className="mt-1 text-xs text-black/45">Record status: {record.status}</p><p className="mt-1 text-xs text-black/55">Current state: {verificationDisplayLabel(verificationDisplayState([record]))}</p></div><dl className="grid gap-1 text-xs sm:text-right"><div><dt className="inline text-black/45">Verified: </dt><dd className="inline">{dateLabel(record.verified_at ?? null)}</dd></div><div><dt className="inline text-black/45">Revoked: </dt><dd className="inline">{dateLabel(record.revoked_at ?? null)}</dd></div><div><dt className="inline text-black/45">Reverify after: </dt><dd className="inline">{dateLabel(record.reverify_after ?? null)}</dd></div></dl></div>)}</div> : <p className="mt-4 text-sm text-black/45">No external verification records.</p>}{verificationError ? null : verificationConflicts.length ? <div className="mt-6"><h3 className="text-sm font-semibold">Duplicate/reuse conflicts</h3><div className="mt-3 divide-y divide-black/10 border-y border-black/10">{verificationConflicts.map((conflict, index) => <div key={`${conflict.provider}-${conflict.created_at ?? index}`} className="flex flex-wrap justify-between gap-3 py-3 text-xs"><span>{conflict.provider || "Provider"} · {conflict.conflict_role === "existing_account" ? "existing account" : "requester"}</span><span className="text-black/45">{dateLabel(conflict.created_at ?? null)}</span></div>)}</div></div> : <p className="mt-4 text-sm text-black/45">No duplicate or reuse conflicts recorded.</p>}</section>
          <section id="security-context"><h2 className="section-title">Security &amp; abuse signals</h2><p className="section-description mt-3">IP matches are informational only. They are not evidence of wrongdoing and do not trigger automatic enforcement.</p>{securityError ? <p className="mt-4 border-y border-black/10 py-5 text-sm text-red-700">Security context could not be loaded.</p> : <><dl className="mt-4 grid gap-3 border-y border-black/10 py-5 text-sm sm:grid-cols-2"><div><dt className="text-black/45">Registration IP</dt><dd className="mt-1 font-mono text-xs">{security?.registration_ip ?? "Not available"}</dd></div><div><dt className="text-black/45">Last sign-in IP</dt><dd className="mt-1 font-mono text-xs">{security?.last_ip ?? "Not available"}</dd></div></dl><div className="mt-6"><h3 className="text-sm font-semibold">Recent IP history</h3>{ipHistory.length ? <div className="mt-3 divide-y divide-black/10 border-y border-black/10">{ipHistory.slice(0, 20).map((entry, index) => <div key={`${entry.created_at}-${index}`} className="flex flex-wrap justify-between gap-3 py-3 text-xs"><span className="font-mono">{entry.ip_address}</span><span className="text-black/45">{entry.action} · {dateLabel(entry.created_at)}</span></div>)}</div> : <p className="mt-3 text-sm text-black/45">No IP history is available from the local Auth audit log.</p>}</div><div className="mt-6"><h3 className="text-sm font-semibold">Other accounts using a matching IP</h3>{otherAccounts.length ? <div className="mt-3 divide-y divide-black/10 border-y border-black/10">{otherAccounts.map((account) => <Link key={account.id} href={withAdminReturnTo(`/app/admin/users/${account.id}`, userContextHref("security-context"))} className="flex flex-wrap items-baseline justify-between gap-3 py-3 text-sm hover:text-brand"><span>{account.display_name || account.username} <span className="text-black/40">@{account.username}</span></span><span className="text-xs text-black/45">{account.deactivated_at ? "Deactivated" : "Active"} · {account.report_count} reports</span></Link>)}</div> : <p className="mt-3 text-sm text-black/45">No matching accounts found.</p>}</div></>}</section>
          <section><h2 className="section-title">About</h2>{profile.bio && <p className="mt-4 max-w-2xl whitespace-pre-wrap text-base leading-7 text-black/70">{profile.bio}</p>}{profile.quote && <p className="mt-5 font-serif text-xl text-brand">“{profile.quote}”</p>}<AdminProfileContentActions userId={profile.id} bio={profile.bio ?? ""} quote={profile.quote ?? ""} hasPhoto={Boolean(profile.has_photo)} removedContent={removedContent} /></section>
          <section><h2 className="section-title">Profile content removals</h2>{contentHistoryError ? <p className="mt-4 text-sm text-red-700">Profile content history could not be loaded.</p> : removedContent.length ? <div className="mt-4 divide-y divide-black/10 border-y border-black/10">{removedContent.map((entry) => <div key={entry.id} className="py-4 text-sm"><div className="flex flex-wrap justify-between gap-3"><span className="uppercase tracking-[.1em] text-brand">{String(entry.content_type).replaceAll("_", " ")}</span><span className="text-xs text-black/45">{dateLabel(entry.created_at)}</span></div><p className="mt-2 whitespace-pre-wrap text-black/65">{entry.previous_value || "Photo pointer removed"}</p><p className="mt-2 text-xs text-black/45">Reason: {entry.reason}</p></div>)}</div> : <p className="mt-4 text-sm text-black/45">No profile content has been removed.</p>}<p className="mt-3 text-xs text-black/40">Removed content is retained privately for moderation review and is not returned to ordinary profile viewers.</p></section>
          <section><h2 className="section-title">Languages</h2>{languages.length ? <div className="mt-4 divide-y divide-black/10 border-y border-black/10">{languages.map((item) => <div key={`${item.name}-${item.purpose}`} className="flex justify-between gap-4 py-3 text-sm"><span className="flex items-center gap-2"><LanguageFlag name={item.name} />{item.name} <span className="text-black/40">· {item.purpose}</span></span><span className="text-black/55">{item.proficiency}</span></div>)}</div> : <p className="mt-4 text-sm text-black/45">No languages added.</p>}</section>
          <section><h2 className="section-title">Interests</h2>{interests.length ? <p className="mt-4 text-sm leading-7 text-black/70">{interests.map((item) => item.name).join(" · ")}</p> : <p className="mt-4 text-sm text-black/45">No interests added.</p>}</section>
          <section id="support-tickets"><h2 className="section-title">Support tickets</h2><p className="section-description mt-3">Support requests submitted by this account. Open a ticket to review its existing staff conversation and status.</p>{supportTicketsError ? <p className="mt-4 text-sm text-red-700">Support tickets could not be loaded.</p> : supportTickets.length ? <div className="mt-4 divide-y divide-black/10 border-y border-black/10">{supportTickets.map((ticket) => <Link key={ticket.id} href={withAdminReturnTo(`/app/admin/support/${ticket.id}`, userContextHref("support-tickets"))} className="flex flex-wrap items-baseline justify-between gap-4 py-4 hover:text-brand"><span><span className="font-mono text-xs">SUP-{ticket.ticket_number}</span> · {ticket.subject}</span><span className="text-xs text-black/45">{ticket.status.replaceAll("_", " ")} · {ticket.priority} · {dateLabel(ticket.updated_at)}</span></Link>)}</div> : <p className="mt-4 text-sm text-black/45">No support tickets were submitted by this account.</p>}</section>
          <section id="moderation-cases"><h2 className="section-title">Moderation cases</h2>{userCasesError ? <p className="mt-4 text-sm text-red-700">Moderation cases could not be loaded.</p> : cases.length ? <div className="mt-4 divide-y divide-black/10 border-y border-black/10">{cases.map((item) => <Link key={item.id} href={withAdminReturnTo(`/app/admin/cases/${item.id}`, userContextHref("moderation-cases"))} className="flex flex-wrap items-baseline justify-between gap-4 py-4 hover:text-brand"><span>{item.status} · priority {item.priority}</span><span className="text-xs text-black/45">{item.report_count} reports · {new Date(item.updated_at).toLocaleString()}</span></Link>)}</div> : <p className="mt-4 text-sm text-black/45">No moderation cases involve this account.</p>}</section>
          <section id="user-conversations"><h2 className="section-title">Conversations involving this user</h2>{conversationReason.length < 10 ? <form className="mt-4 border-y border-black/10 py-5" method="get"><input type="hidden" name="return_to" value={returnTo ?? ""}/><label htmlFor="conversation-reason" className="text-sm text-black/60">Reason to load conversation metadata (required)</label><p className="mt-1 text-xs text-black/45">This privileged access is logged. Enter at least 10 characters.</p><div className="mt-3 flex flex-col gap-2 sm:flex-row"><input id="conversation-reason" name="conversation_reason" required minLength={10} maxLength={200} className="field flex-1" placeholder="e.g. Reviewing a reported safety concern"/><button className="btn-secondary px-4 py-2.5 text-sm">Load conversations</button></div></form> : conversationError ? <p className="mt-4 text-sm text-red-700">Conversations could not be loaded.</p> : conversations.length ? <div className="mt-4 divide-y divide-black/10 border-y border-black/10">{conversations.map((conversation) => { const participants = conversation.participants ?? []; return <Link key={conversation.id} href={withAdminReturnTo(`/app/admin/conversations/${conversation.id}?user=${profile.id}&reason=${encodeURIComponent(conversationReason)}`, userContextHref("user-conversations"))} className="flex flex-wrap items-baseline justify-between gap-4 py-4 hover:text-brand"><span>{participants.map((participant) => participant.display_name || participant.username || "Deleted user").join(" · ")}</span><span className="text-xs text-black/45">{conversation.last_message_at ? new Date(conversation.last_message_at).toLocaleString() : "No messages"}</span></Link>; })}</div> : <p className="mt-4 text-sm text-black/45">No conversations involve this account.</p>}<p className="mt-3 text-xs text-black/40">Opening a conversation uses privileged, read-only moderation access and is recorded in the audit log.</p></section>
          <section id="user-reports"><h2 className="section-title">Reports involving this user</h2>{reports.length ? <div className="mt-4 divide-y divide-black/10 border-y border-black/10">{reports.map((report) => <Link key={report.id} href={withAdminReturnTo(`/app/admin/reports?report=${report.id}`, userContextHref("user-reports"))} className="block py-4 hover:text-brand"><div className="flex justify-between gap-4 text-sm"><span>{report.target_type} · {report.reason}</span><span className="text-xs uppercase tracking-[.1em] text-black/45">{report.status}</span></div><p className="mt-1 text-xs text-black/45">{dateLabel(report.created_at)}</p></Link>)}</div> : <p className="mt-4 text-sm text-black/45">No reports involve this account.</p>}</section>
          <section id="moderation-history"><h2 className="section-title">Moderation history</h2>{audit.length ? <div className="mt-4 divide-y divide-black/10 border-y border-black/10">{audit.map((entry) => <div key={entry.id} className="py-4 text-sm"><p>{entry.action.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-black/45">{entry.old_status ?? "—"} → {entry.new_status ?? "—"} · {dateLabel(entry.created_at)}</p>{entry.report_id && <Link href={withAdminReturnTo(`/app/admin/reports?report=${entry.report_id}`, userContextHref("moderation-history"))} className="mt-1 inline-block text-xs text-brand hover:underline">View report</Link>}</div>)}</div> : <p className="mt-4 text-sm text-black/45">No moderation history.</p>}</section>
        </div>
        <aside className="space-y-8 lg:border-l lg:border-black/10 lg:pl-10"><div><h2 className="section-title">Admin actions</h2><p className="section-description mt-3">Changes are authorized and audited by the database. Profile content remains subject to its normal privacy rules.</p>{uid === profile.id ? <p className="mt-5 text-sm text-black/50">You cannot change your own role or account status.</p> : <AdminUserActions userId={profile.id} role={profile.role} deactivated={Boolean(profile.deactivated_at)} />}</div><AdminProfileBadgeActions userId={profile.id} badges={Array.isArray(profileBadges) ? profileBadges as unknown as Array<{ badge_key?: unknown; is_derived?: unknown }> : []} /><div id="public-profile" className="border-t border-black/10 pt-6"><h2 className="subsection-title">Profile</h2><Link href={withAdminReturnTo(`/app/profile/${profile.username}?from=admin`, userContextHref("public-profile"))} className="mt-3 inline-block text-sm text-brand hover:underline">Open public profile →</Link></div></aside>
      </div>
    </div>
  </main>;
}
