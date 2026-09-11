"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin, requireStaff } from "../guard";
import { safeAdminReturnTo } from "../investigation-context";
import {
  sendPublicContactReplyEmail,
  SupportEmailConfigurationError,
  SupportEmailDeliveryError,
} from "@/lib/email/resend";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SUPPORT_STATUSES = new Set(["open", "waiting_staff", "waiting_user", "resolved"]);

function ticketPath(ticketId: string, returnTo: string | null | undefined, params: Record<string, string> = {}) {
  const safeReturn = safeAdminReturnTo(returnTo) ?? "/app/admin/support";
  const query = new URLSearchParams({ return_to: safeReturn, ...params });
  return `/app/admin/support/${encodeURIComponent(ticketId)}?${query.toString()}`;
}

function ticketError(ticketId: string, returnTo: string | null | undefined, message: string): never {
  redirect(UUID_PATTERN.test(ticketId) ? ticketPath(ticketId, returnTo, { error: message }) : `/app/admin/support?error=${encodeURIComponent(message)}`);
}

function readTicket(formData: FormData) {
  return {
    ticketId: String(formData.get("ticket_id") ?? "").trim(),
    returnTo: String(formData.get("return_to") ?? "").trim(),
  };
}

export async function claimSupportTicket(formData: FormData) {
  const { db } = await requireStaff();
  const { ticketId, returnTo } = readTicket(formData);
  if (!UUID_PATTERN.test(ticketId)) ticketError(ticketId, returnTo, "That support ticket could not be found.");
  const { error } = await db.rpc("staff_claim_support_ticket", { ticket_uuid: ticketId });
  if (error) ticketError(ticketId, returnTo, error.message ?? "Support ticket could not be claimed.");
  redirect(ticketPath(ticketId, returnTo, { updated: "claimed" }));
}

export async function releaseSupportTicket(formData: FormData) {
  const { db } = await requireStaff();
  const { ticketId, returnTo } = readTicket(formData);
  if (!UUID_PATTERN.test(ticketId)) ticketError(ticketId, returnTo, "That support ticket could not be found.");
  const { error } = await db.rpc("staff_release_support_ticket", { ticket_uuid: ticketId });
  if (error) ticketError(ticketId, returnTo, error.message ?? "Support ticket assignment could not be released.");
  redirect(ticketPath(ticketId, returnTo, { updated: "released" }));
}

export async function staffReplyToSupportTicket(formData: FormData) {
  const { db, role, uid } = await requireStaff();
  const { ticketId, returnTo } = readTicket(formData);
  const body = String(formData.get("body") ?? "").trim();
  const token = String(formData.get("submission_token") ?? "").trim();
  if (!UUID_PATTERN.test(ticketId)) ticketError(ticketId, returnTo, "That support ticket could not be found.");
  if (body.length < 1 || body.length > 4000) ticketError(ticketId, returnTo, "A public reply must be between 1 and 4,000 characters.");
  if (!UUID_PATTERN.test(token)) ticketError(ticketId, returnTo, "Please try sending your reply again.");

  const { data: ticketData, error: ticketLoadError } = await db.rpc("staff_get_support_ticket", { ticket_uuid: ticketId });
  const ticket = ticketData && typeof ticketData === "object" && "ticket" in ticketData ? ticketData.ticket as {
    ticket_type?: string | null;
    ticket_code?: string | null;
    subject?: string | null;
    status?: string | null;
    contact?: { email?: string | null } | null;
    assigned_staff?: { id?: string | null } | null;
  } : null;
  if (ticketLoadError || !ticket) ticketError(ticketId, returnTo, "That support ticket could not be found.");

  if (ticket.ticket_type === "public_contact") {
    const assignedStaffId = ticket.assigned_staff?.id ?? null;
    if (ticket.status === "resolved") ticketError(ticketId, returnTo, "Reopen the contact ticket before sending an email reply.");
    if (role !== "admin" && assignedStaffId !== uid) ticketError(ticketId, returnTo, "Claim this contact ticket before sending an email reply.");
    const contactEmail = ticket.contact?.email?.trim();
    if (!contactEmail) ticketError(ticketId, returnTo, "This contact ticket does not have an email address.");
    try {
      await sendPublicContactReplyEmail({
        to: contactEmail,
        subject: `Re: ${ticket.ticket_code ?? "Pen-Pals contact"} ${ticket.subject ?? ""}`.trim(),
        body,
        ticketCode: ticket.ticket_code ?? "Pen-Pals contact",
        idempotencyKey: token,
      });
    } catch (error) {
      const message = error instanceof SupportEmailConfigurationError
        ? "Support email is not configured on this server, so the reply was not saved."
        : error instanceof SupportEmailDeliveryError
          ? "The email could not be sent, so the reply was not saved."
          : "The email reply could not be sent, so the reply was not saved.";
      ticketError(ticketId, returnTo, message);
    }
  }

  const { error } = await db.rpc("staff_reply_to_support_ticket", { ticket_uuid: ticketId, p_body: body, p_submission_token: token });
  if (error) ticketError(ticketId, returnTo, error.message ?? "Public reply could not be sent.");
  redirect(ticketPath(ticketId, returnTo, { updated: ticket.ticket_type === "public_contact" ? "email_reply" : "public_reply" }));
}

export async function addSupportInternalNote(formData: FormData) {
  const { db } = await requireStaff();
  const { ticketId, returnTo } = readTicket(formData);
  const body = String(formData.get("body") ?? "").trim();
  if (!UUID_PATTERN.test(ticketId)) ticketError(ticketId, returnTo, "That support ticket could not be found.");
  if (body.length < 1 || body.length > 4000) ticketError(ticketId, returnTo, "An internal note must be between 1 and 4,000 characters.");
  const { error } = await db.rpc("staff_add_support_ticket_note", { ticket_uuid: ticketId, p_body: body });
  if (error) ticketError(ticketId, returnTo, error.message ?? "Internal note could not be saved.");
  redirect(ticketPath(ticketId, returnTo, { updated: "internal_note" }));
}

export async function setSupportTicketStatus(formData: FormData) {
  const { db } = await requireStaff();
  const { ticketId, returnTo } = readTicket(formData);
  const status = String(formData.get("status") ?? "").trim().toLowerCase();
  if (!UUID_PATTERN.test(ticketId)) ticketError(ticketId, returnTo, "That support ticket could not be found.");
  if (!SUPPORT_STATUSES.has(status)) ticketError(ticketId, returnTo, "Choose a valid support ticket status.");
  const { error } = await db.rpc("staff_set_support_ticket_status", { ticket_uuid: ticketId, new_status: status });
  if (error) ticketError(ticketId, returnTo, error.message ?? "Support ticket status could not be updated.");
  revalidatePath("/app", "layout");
  redirect(ticketPath(ticketId, returnTo, { updated: status === "open" ? "reopened" : "status" }));
}
export async function createContactRetentionHold(formData: FormData) {
  const { db } = await requireAdmin();
  const { ticketId, returnTo } = readTicket(formData);
  const reason = String(formData.get("reason") ?? "").trim();
  if (!UUID_PATTERN.test(ticketId)) ticketError(ticketId, returnTo, "That contact ticket could not be found.");
  if (reason.length < 1 || reason.length > 2000) ticketError(ticketId, returnTo, "Provide a retention-hold reason between 1 and 2,000 characters.");
  const { error } = await db.rpc("admin_preserve_contact_evidence", {
    ticket_uuid: ticketId,
    hold_reason: reason,
  });
  if (error) ticketError(ticketId, returnTo, error.message ?? "The Contact evidence hold could not be created.");
  revalidatePath(`/app/admin/support/${ticketId}`);
  revalidatePath("/app/admin/privacy-retention");
  redirect(ticketPath(ticketId, returnTo, { updated: "contact_hold_created" }));
}

export async function releaseContactRetentionHold(formData: FormData) {
  const { db } = await requireAdmin();
  const { ticketId, returnTo } = readTicket(formData);
  const holdId = String(formData.get("hold_id") ?? "").trim();
  if (!UUID_PATTERN.test(ticketId)) ticketError(ticketId, returnTo, "That contact ticket could not be found.");
  if (!UUID_PATTERN.test(holdId)) ticketError(ticketId, returnTo, "That retention hold could not be found.");
  const { error } = await db.rpc("admin_release_contact_evidence_hold", { ticket_uuid: ticketId, hold_uuid: holdId });
  if (error) ticketError(ticketId, returnTo, error.message ?? "The Contact evidence hold could not be released.");
  revalidatePath(`/app/admin/support/${ticketId}`);
  revalidatePath("/app/admin/privacy-retention");
  redirect(ticketPath(ticketId, returnTo, { updated: "contact_hold_released" }));
}


export async function escalateContactInvestigation(formData: FormData) {
  const { db } = await requireAdmin();
  const { ticketId, returnTo } = readTicket(formData);
  const reason = String(formData.get("reason") ?? "").trim();
  if (!UUID_PATTERN.test(ticketId)) ticketError(ticketId, returnTo, "That contact ticket could not be found.");
  if (reason.length < 1 || reason.length > 2000) ticketError(ticketId, returnTo, "Provide an escalation reason between 1 and 2,000 characters.");
  const { data, error } = await db.rpc("admin_escalate_contact_investigation", {
    ticket_uuid: ticketId,
    escalation_reason: reason,
  });
  if (error) ticketError(ticketId, returnTo, error.message ?? "The Contact ticket could not be escalated.");
  revalidatePath(`/app/admin/support/${ticketId}`);
  revalidatePath("/app/admin/contact");
  redirect(ticketPath(ticketId, returnTo, { updated: "contact_escalated", investigation: String(data ?? "") }));
}
