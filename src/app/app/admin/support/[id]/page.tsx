/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "../../guard";
import { AdminHeader, AdminPage, StatusChip, toneForStatus } from "../../AdminChrome";
import { safeAdminReturnTo } from "../../investigation-context";
import SupportAttachmentViewer, { type SupportAttachment } from "@/app/app/support/SupportAttachmentViewer";
import { addSupportInternalNote, claimSupportTicket, createContactRetentionHold, escalateContactInvestigation, releaseContactRetentionHold, releaseSupportTicket, setSupportTicketStatus, staffReplyToSupportTicket } from "../actions";
import StaffSupportSubmitButton from "../StaffSupportSubmitButton";
import ContactAbuseContext from "../ContactAbuseContext";

function labelFor(value: unknown) {
  return String(value ?? "").replaceAll("_", " ");
}

function statusLabel(value: unknown, isPublicContact = false) {
  return ({ open: "Open", waiting_staff: "Waiting for staff", waiting_user: isPublicContact ? "Waiting for contact" : "Waiting for user", resolved: "Resolved" } as Record<string, string>)[String(value)] ?? labelFor(value);
}

function dateLabel(value: unknown) {
  return value ? new Date(String(value)).toLocaleString() : "—";
}

function priorityTone(priority: string) {
  if (priority === "urgent" || priority === "high") return "danger" as const;
  if (priority === "low") return "good" as const;
  return "neutral" as const;
}

export default async function SupportTicket({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ return_to?: string; error?: string; updated?: string }> }) {
  const { db, role, uid } = await requireStaff();
  const { id } = await params;
  const query = await searchParams;
  const { data, error } = await db.rpc("staff_get_support_ticket", { ticket_uuid: id });
  if (error) throw error;
  if (!data?.ticket) notFound();

  const ticket = data.ticket;
  const isPublicContact = ticket.ticket_type === "public_contact";
  const { data: contactIntegrity, error: contactIntegrityError } = isPublicContact
    ? await db.rpc("staff_get_contact_submission_integrity", { ticket_uuid: id })
    : { data: null, error: null };
  if (contactIntegrityError) throw contactIntegrityError;
  const returnTo = safeAdminReturnTo(query.return_to) ?? (isPublicContact ? "/app/admin/contact" : "/app/admin/support");
  const messages = Array.isArray(data.messages) ? data.messages : [];
  const rawAttachments = Array.isArray(data.attachments) ? data.attachments : [];
  const attachments: SupportAttachment[] = (await Promise.all(rawAttachments.map(async (attachment: any) => {
    const storagePath = typeof attachment?.storage_path === "string" ? attachment.storage_path : "";
    if (!storagePath) return null;
    const { data: signed, error: signedError } = await db.storage.from("support-attachments").createSignedUrl(storagePath, 600);
    return {
      id: String(attachment.id),
      fileName: String(attachment.file_name ?? "Attachment"),
      mimeType: String(attachment.mime_type ?? "application/octet-stream"),
      sizeBytes: Number(attachment.size_bytes ?? 0),
      createdAt: attachment.created_at ? String(attachment.created_at) : null,
      signedUrl: signedError || !signed?.signedUrl ? null : signed.signedUrl,
    } satisfies SupportAttachment;
  }))).filter((attachment): attachment is SupportAttachment => Boolean(attachment));

  const assignedStaffId = ticket.assigned_staff?.id ?? null;
  const canAct = role === "admin" || assignedStaffId === uid;
  const contactMetadata = isPublicContact && ticket.contact?.metadata && typeof ticket.contact.metadata === "object" ? ticket.contact.metadata as Record<string, unknown> : {};
  let contactRecordHold: { id: string; reason: string; started_at: string } | null = null;
  let contactCategoryHold: { id: string; reason: string; started_at: string } | null = null;
  let contactInvestigation: { id: string; status: string; reason: string; created_at: string } | null = null;
  if (isPublicContact && role === "admin") {
    const [{ data: retentionConfig, error: retentionError }, { data: investigationData, error: investigationError }] = await Promise.all([
      db.rpc("admin_get_retention_config"),
      db.rpc("admin_get_contact_investigation", { ticket_uuid: id }),
    ]);
    if (investigationError) throw investigationError;
    if (investigationData && typeof investigationData === "object") {
      const investigation = investigationData as Record<string, unknown>;
      contactInvestigation = { id: String(investigation.id ?? ""), status: String(investigation.status ?? "open"), reason: String(investigation.reason ?? ""), created_at: String(investigation.created_at ?? "") };
    }
    if (retentionError) throw retentionError;
    const holds = Array.isArray((retentionConfig as { holds?: unknown[] } | null)?.holds) ? (retentionConfig as { holds: unknown[] }).holds : [];
    for (const row of holds) {
      if (!row || typeof row !== "object") continue;
      const hold = row as Record<string, unknown>;
      if (hold.category !== "contact_evidence") continue;
      const parsed = { id: String(hold.id ?? ""), reason: String(hold.reason ?? ""), started_at: String(hold.started_at ?? "") };
      if (hold.record_id === id) contactRecordHold = parsed;
      else if (hold.record_id == null) contactCategoryHold = parsed;
    }
  }
  const status = String(ticket.status ?? "open");
  const updatedMessage = query.updated === "claimed"
    ? "Ticket claimed by you."
    : query.updated === "released"
      ? "Ticket assignment released."
      : query.updated === "email_reply"
        ? "Email reply sent and recorded; the ticket is now waiting for the contact."
        : query.updated === "public_reply"
          ? "Public reply sent; the ticket is now waiting for the user."
          : query.updated === "internal_note"
            ? "Internal note saved for staff."
            : query.updated === "reopened"
              ? "Ticket reopened."
              : query.updated === "status"
                ? "Ticket status updated."
                : query.updated === "contact_hold_created"
                  ? "Contact evidence retention hold created."
                  : query.updated === "contact_hold_released"
                    ? "Contact evidence retention hold released."
                    : query.updated === "contact_escalated"
                      ? "Contact ticket escalated to an investigation and placed under retention hold."
                      : null;

  return <AdminPage>
    <AdminHeader active={isPublicContact ? "contact" : "support"} eyebrow={isPublicContact ? "Contact message" : "Support ticket"} title={ticket.ticket_code} description={ticket.subject} backHref={returnTo} backLabel={isPublicContact ? "Contact Inbox" : "Support Inbox"} isAdmin={role === "admin"}>
      <div className="flex flex-wrap justify-end gap-2"><StatusChip value={statusLabel(status, isPublicContact)} tone={toneForStatus(status)} /><StatusChip value={labelFor(ticket.priority)} tone={priorityTone(ticket.priority)} /></div>
    </AdminHeader>
    {query.error && <p role="alert" className="notice notice-error mt-6">{query.error}</p>}
    {updatedMessage && <p role="status" className="notice notice-success mt-6">{updatedMessage}</p>}

    <section className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div>
        <section aria-labelledby="ticket-details-heading">
          <h2 id="ticket-details-heading" className="section-title">Ticket details</h2>
          <dl className="mt-4 grid gap-x-8 gap-y-4 border-y border-black/10 py-5 text-sm sm:grid-cols-2">
            <div><dt className="text-black/45">Subject</dt><dd className="mt-1 font-medium">{ticket.subject}</dd></div>
            <div><dt className="text-black/45">Category</dt><dd className="mt-1">{labelFor(ticket.category)}</dd></div>
            <div><dt className="text-black/45">{isPublicContact ? "Contact" : "Requester"}</dt><dd className="mt-1">{isPublicContact ? <span>{ticket.requester?.display_name || "Public contact"}{ticket.contact?.email ? <span className="mt-1 block text-xs text-black/50">{ticket.contact.email}</span> : null}</span> : ticket.requester ? (role === "admin" && ticket.requester.id ? <Link href={`/app/admin/users/${ticket.requester.id}`} className="text-brand hover:underline">{ticket.requester.display_name || ticket.requester.username}</Link> : <span>{ticket.requester.display_name || ticket.requester.username}</span>) : "Former account"}</dd></div>
            <div><dt className="text-black/45">Created</dt><dd className="mt-1">{dateLabel(ticket.created_at)}</dd></div>
            <div><dt className="text-black/45">Last updated</dt><dd className="mt-1">{dateLabel(ticket.updated_at)}</dd></div>
            <div><dt className="text-black/45">Assigned to</dt><dd className="mt-1">{ticket.assigned_staff?.display_name || "Unassigned"}</dd></div>
          </dl>
        </section>

        <section className="mt-10" aria-labelledby="ticket-conversation-heading">
          <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="admin-eyebrow">Conversation</p><h2 id="ticket-conversation-heading" className="section-title mt-1">{isPublicContact ? "Contact messages" : "Support messages"}</h2></div><p className="text-sm text-black/45">{messages.length} message{messages.length === 1 ? "" : "s"}</p></div>
          {messages.length ? <div className="mt-4 divide-y divide-black/10 border-y border-black/10">{messages.map((message: any, index: number) => <article key={message.id} className={`py-5 ${message.is_internal ? "bg-[#fff9ec] px-4" : ""}`}><div className="flex flex-wrap items-baseline justify-between gap-3"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{message.author_name}</p><StatusChip value={message.is_internal ? "Internal note · staff only" : isPublicContact && message.author_id ? "Email reply · contact can see" : isPublicContact ? "Contact message" : "Public reply · requester can see"} tone={message.is_internal ? "warn" : "good"} /></div><span className="text-xs text-black/45">{dateLabel(message.created_at)}</span></div><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-black/70">{message.body}</p>{index === 0 && attachments.length > 0 && <SupportAttachmentViewer attachments={attachments} />}</article>)}</div> : <>{<p className="mt-4 border-y border-black/10 py-10 text-sm text-black/50">No messages are attached to this ticket yet.</p>}{attachments.length > 0 && <SupportAttachmentViewer attachments={attachments} />}</>}
        </section>

        <div className="mt-10 grid gap-8 xl:grid-cols-2">
          <section className="border border-[#087456]/20 bg-white/30 p-5" aria-labelledby="public-reply-heading">
            <p className="admin-eyebrow">{isPublicContact ? "Email reply" : "Requester-visible"}</p>
            <h2 id="public-reply-heading" className="section-title mt-1">{isPublicContact ? "Reply by email" : "Public reply"}</h2>
            <p className="mt-2 text-sm text-black/55">{isPublicContact ? <>This sends an email to the contact address and records the reply on this ticket.</> : <>This message is sent to the requester and moves the ticket to <strong>Waiting for user</strong>.</>}</p>
            {status === "resolved" ? <p className="mt-5 text-sm text-black/50">Reopen the ticket before sending {isPublicContact ? "an email reply" : "a public reply"}.</p> : canAct ? <form action={staffReplyToSupportTicket} className="mt-5 space-y-3"><input type="hidden" name="ticket_id" value={id} /><input type="hidden" name="return_to" value={returnTo} /><input type="hidden" name="submission_token" value={crypto.randomUUID()} /><label htmlFor="support-public-reply" className="block text-sm font-medium text-primary">{isPublicContact ? "Email message" : "Message to requester"}<textarea id="support-public-reply" name="body" required maxLength={4000} rows={5} className="field mt-2 min-h-28 w-full resize-y" placeholder={isPublicContact ? "Write the email reply this contact should receive." : "Write the update the requester should see."} /></label><div className="flex justify-end"><StaffSupportSubmitButton label={isPublicContact ? "Send email reply" : "Send public reply"} pendingLabel="Sending…" primary /></div></form> : <p className="mt-5 text-sm text-black/50">Claim this ticket before sending {isPublicContact ? "an email reply" : "a public reply"}.</p>}
          </section>
          <section className="border border-[#c8871b]/30 bg-[#fff9ec] p-5" aria-labelledby="internal-note-heading">
            <p className="admin-eyebrow text-[#8a5a00]">Staff-only</p>
            <h2 id="internal-note-heading" className="section-title mt-1">Internal staff note</h2>
            <p className="mt-2 text-sm text-[#6d5525]">Only staff can see this note. It is never included in the user conversation.</p>
            {canAct ? <form action={addSupportInternalNote} className="mt-5 space-y-3"><input type="hidden" name="ticket_id" value={id} /><input type="hidden" name="return_to" value={returnTo} /><label htmlFor="support-internal-note" className="block text-sm font-medium text-[#5c481e]">Private note<textarea id="support-internal-note" name="body" required maxLength={4000} rows={5} className="field mt-2 min-h-28 w-full resize-y bg-[#fffdfa]" placeholder="Record context for the next staff member." /></label><div className="flex justify-end"><StaffSupportSubmitButton label="Save internal note" pendingLabel="Saving…" /></div></form> : <p className="mt-5 text-sm text-[#6d5525]">Claim this ticket before adding an internal note.</p>}
          </section>
        </div>
      </div>

      <aside className="space-y-8 border-l border-black/10 pl-8">
        <section aria-labelledby="queue-context-heading"><h2 id="queue-context-heading" className="section-title">Queue context</h2><p className="mt-3 text-sm text-black/55">This ticket is part of the {isPublicContact ? "Contact Inbox" : "Support Inbox"} and is separate from moderation cases.</p><dl className="mt-5 space-y-3 border-t border-black/10 pt-4 text-sm"><div><dt className="text-black/45">Ticket type</dt><dd className="mt-1">{ticket.ticket_type}</dd></div><div><dt className="text-black/45">Status</dt><dd className="mt-1">{statusLabel(status, isPublicContact)}</dd></div><div><dt className="text-black/45">Priority</dt><dd className="mt-1">{labelFor(ticket.priority)}</dd></div></dl></section>
        {isPublicContact && <ContactAbuseContext metadata={contactMetadata} createdAt={ticket.created_at} integrity={contactIntegrity && typeof contactIntegrity === "object" ? contactIntegrity as Record<string, unknown> : null} />}
        {isPublicContact && role === "admin" && <section className="border-t border-black/10 pt-7" aria-labelledby="contact-investigation-heading">
          <p className="admin-eyebrow">Administrator only</p>
          <h2 id="contact-investigation-heading" className="subsection-title mt-1">Investigation</h2>
          {contactInvestigation ? <>
            <p className="mt-3 text-sm font-medium text-[#8a5a00]">This Contact ticket has been escalated for investigation.</p>
            <dl className="mt-3 space-y-2 text-xs text-black/55"><div><dt className="font-medium text-black/45">Status</dt><dd className="mt-1">{labelFor(contactInvestigation.status)}</dd></div><div><dt className="font-medium text-black/45">Reason</dt><dd className="mt-1 leading-5">{contactInvestigation.reason}</dd></div><div><dt className="font-medium text-black/45">Escalated</dt><dd className="mt-1">{dateLabel(contactInvestigation.created_at)}</dd></div></dl>
            <form action={`/api/admin/contact-export/${id}`} method="post" className="mt-5 space-y-3 border-t border-black/10 pt-4"><label className="block text-sm text-black/60">Export reason<textarea name="reason" required maxLength={2000} rows={3} className="field mt-2 w-full resize-y" placeholder="Why is this forensic evidence package being prepared?" /></label><button className="btn-secondary w-full px-4 py-2.5 text-sm">Export evidence package</button><p className="text-xs leading-5 text-black/40">Creates a ZIP containing the immutable submission, ticket/messages, investigation, retention history, audit trail, embedded attachments and SHA-256 checksums. Export preparation is audited.</p></form>
          </> : <>
            <p className="mt-3 text-sm text-black/55">Escalate only when this Contact matter requires a formal internal investigation. Escalation automatically preserves the ticket under a record-level retention hold.</p>
            <form action={escalateContactInvestigation} className="mt-4 space-y-3"><input type="hidden" name="ticket_id" value={id} /><input type="hidden" name="return_to" value={returnTo} /><label className="block text-sm text-black/60">Escalation reason<textarea name="reason" required maxLength={2000} rows={3} className="field mt-2 w-full resize-y" placeholder="Why does this Contact matter require investigation?" /></label><StaffSupportSubmitButton label="Escalate to investigation" pendingLabel="Escalating…" primary /></form>
          </>}
        </section>}
        {isPublicContact && role === "admin" && <section className="border-t border-black/10 pt-7" aria-labelledby="contact-retention-heading">
          <p className="admin-eyebrow">Administrator only</p>
          <h2 id="contact-retention-heading" className="subsection-title mt-1">Evidence retention</h2>
          {contactRecordHold ? <>
            <p className="mt-3 text-sm font-medium text-[#8a5a00]">This Contact ticket has an active record-level retention hold.</p>
            <dl className="mt-3 space-y-2 text-xs text-black/55"><div><dt className="font-medium text-black/45">Reason</dt><dd className="mt-1 leading-5">{contactRecordHold.reason}</dd></div><div><dt className="font-medium text-black/45">Started</dt><dd className="mt-1">{dateLabel(contactRecordHold.started_at)}</dd></div></dl>
            {contactInvestigation && ["open", "investigating"].includes(contactInvestigation.status) ? <p className="mt-4 text-xs leading-5 text-black/50">This hold is locked while the Contact investigation is active. Resolve the investigation before releasing the evidence hold.</p> : <form action={releaseContactRetentionHold} className="mt-4"><input type="hidden" name="ticket_id" value={id} /><input type="hidden" name="return_to" value={returnTo} /><input type="hidden" name="hold_id" value={contactRecordHold.id} /><StaffSupportSubmitButton label="Release ticket hold" pendingLabel="Releasing…" /></form>}
          </> : contactCategoryHold ? <>
            <p className="mt-3 text-sm font-medium text-[#8a5a00]">This ticket is protected by a category-wide Contact evidence hold.</p>
            <p className="mt-2 text-xs leading-5 text-black/50">{contactCategoryHold.reason}</p>
            <p className="mt-3 text-xs text-black/40">Manage category-wide holds from Privacy &amp; Retention.</p>
          </> : <>
            <p className="mt-3 text-sm text-black/55">Preserve this ticket and its dependent Contact conversation from configured retention cleanup.</p>
            <form action={createContactRetentionHold} className="mt-4 space-y-3"><input type="hidden" name="ticket_id" value={id} /><input type="hidden" name="return_to" value={returnTo} /><label className="block text-sm text-black/60">Hold reason<textarea name="reason" required maxLength={2000} rows={3} className="field mt-2 w-full resize-y" placeholder="Why must this Contact evidence be preserved?" /></label><StaffSupportSubmitButton label="Preserve this ticket" pendingLabel="Preserving…" primary /></form>
          </>}
        </section>}
        <section className="border-t border-black/10 pt-7" aria-labelledby="assignment-heading"><h2 id="assignment-heading" className="subsection-title">Assignment</h2><p className="mt-3 text-sm text-black/55">{assignedStaffId ? `Assigned to ${ticket.assigned_staff?.display_name || "another staff member"}.` : "No staff member owns this ticket yet."}</p>{!assignedStaffId ? <form action={claimSupportTicket} className="mt-4"><input type="hidden" name="ticket_id" value={id} /><input type="hidden" name="return_to" value={returnTo} /><StaffSupportSubmitButton label="Claim ticket" pendingLabel="Claiming…" primary /></form> : (assignedStaffId === uid || role === "admin") ? <form action={releaseSupportTicket} className="mt-4"><input type="hidden" name="ticket_id" value={id} /><input type="hidden" name="return_to" value={returnTo} /><StaffSupportSubmitButton label="Release assignment" pendingLabel="Releasing…" /></form> : <p className="mt-4 text-xs text-black/45">Only the assigned staff member or an administrator can change this assignment.</p>}</section>
        <section className="border-t border-black/10 pt-7" aria-labelledby="status-heading"><h2 id="status-heading" className="subsection-title">Ticket status</h2>{canAct ? <form action={setSupportTicketStatus} className="mt-4 space-y-3"><input type="hidden" name="ticket_id" value={id} /><input type="hidden" name="return_to" value={returnTo} /><label className="block text-sm text-black/60">Set status<select name="status" defaultValue={status} className="field mt-2 w-full"><option value="open">Open</option><option value="waiting_staff">Waiting for staff</option><option value="waiting_user">{isPublicContact ? "Waiting for contact" : "Waiting for user"}</option><option value="resolved">Resolved</option></select></label><StaffSupportSubmitButton label={status === "resolved" ? "Reopen or update status" : "Save status"} pendingLabel="Saving…" primary /></form> : <p className="mt-4 text-sm text-black/55">Claim this ticket before changing its status.</p>}</section>
      </aside>
    </section>
  </AdminPage>;
}
