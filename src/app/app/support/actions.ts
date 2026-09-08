"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

const CATEGORY_MAP: Record<string, string> = {
  account_access: "account_access",
  profile: "profile",
  communication: "communication",
  snail_mail: "snail_mail",
  privacy_safety: "privacy_safety",
  technical_problem: "bug_report",
  bug_report: "bug_report",
  feedback: "feedback",
  other: "other",
};
const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "text/plain"]);
const EXTENSIONS: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "text/plain": "txt" };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function returnError(message: string): never {
  redirect(`/app/support?error=${encodeURIComponent(message)}`);
}

function replyError(ticketId: string, message: string): never {
  redirect(`/app/support/requests/${encodeURIComponent(ticketId)}?error=${encodeURIComponent(message)}`);
}

function cleanupPaths(db: Awaited<ReturnType<typeof createClient>>, paths: string[]) {
  return paths.length ? db.storage.from("support-attachments").remove(paths) : Promise.resolve({ error: null });
}

export async function submitSupportTicket(formData: FormData) {
  const db = await createClient();
  const { data: claimsData } = await db.auth.getClaims();
  const uid = claimsData?.claims?.sub;
  if (!uid) redirect("/sign-in");

  const category = CATEGORY_MAP[String(formData.get("category") ?? "").trim().toLowerCase()];
  const subject = String(formData.get("subject") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const submissionTokenValue = String(formData.get("submission_token") ?? "").trim();
  const submissionToken = UUID_PATTERN.test(submissionTokenValue) ? submissionTokenValue : null;
  if (!category) returnError("Choose a support category.");
  if (subject.length < 3 || subject.length > 200) returnError("Subject must be between 3 and 200 characters.");
  if (description.length < 10 || description.length > 4000) returnError("Description must be between 10 and 4,000 characters.");

  const files = formData.getAll("attachments").filter((value): value is File => value instanceof File && value.size > 0);
  if (files.length > MAX_ATTACHMENTS) returnError(`You can attach up to ${MAX_ATTACHMENTS} files.`);
  if (files.some((file) => file.size > MAX_ATTACHMENT_BYTES || !ALLOWED_TYPES.has(file.type))) {
    returnError("Attachments must be PDF, JPG, PNG, WebP, or plain text files under 10 MB each.");
  }

  const uploadedPaths: string[] = [];
  const attachments = [] as Array<{ storage_path: string; file_name: string; mime_type: string; size_bytes: number }>;
  for (const file of files) {
    const extension = EXTENSIONS[file.type];
    const storagePath = `${uid}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await db.storage.from("support-attachments").upload(storagePath, file, { contentType: file.type, upsert: false });
    if (uploadError) {
      await cleanupPaths(db, uploadedPaths);
      returnError("We couldn't upload one of those attachments. Please try again.");
    }
    uploadedPaths.push(storagePath);
    attachments.push({ storage_path: storagePath, file_name: file.name.slice(0, 200), mime_type: file.type, size_bytes: file.size });
  }

  const { data: ticketId, error } = await db.rpc("submit_support_ticket", {
    p_category: category,
    p_subject: subject,
    p_description: description,
    p_attachments: attachments,
    p_submission_token: submissionToken,
  });
  if (error) {
    await cleanupPaths(db, uploadedPaths);
    const message = error.message?.toLowerCase().includes("verified")
      ? "Please verify your email before contacting support."
      : error.message?.toLowerCase().includes("unavailable")
        ? "Your account is not currently available."
        : "We couldn't submit your support request. Please try again.";
    returnError(message);
  }

  redirect(`/app/support?submitted=1&ticket=${encodeURIComponent(String(ticketId))}`);
}

export async function replyToSupportTicket(formData: FormData) {
  const db = await createClient();
  const { data: claimsData } = await db.auth.getClaims();
  const uid = claimsData?.claims?.sub;
  if (!uid) redirect("/sign-in");

  const ticketId = String(formData.get("ticket_id") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const submissionTokenValue = String(formData.get("submission_token") ?? "").trim();
  const submissionToken = UUID_PATTERN.test(submissionTokenValue) ? submissionTokenValue : null;
  if (!UUID_PATTERN.test(ticketId)) replyError(ticketId, "That support request could not be found.");
  if (body.length < 1 || body.length > 4000) replyError(ticketId, "Your reply must be between 1 and 4,000 characters.");
  if (!submissionToken) replyError(ticketId, "Please try sending your reply again.");

  const { error } = await db.rpc("reply_to_support_ticket", {
    ticket_uuid: ticketId,
    p_body: body,
    p_submission_token: submissionToken,
  });
  if (error) {
    const message = error.message?.toLowerCase().includes("closed")
      ? "This support request is closed and can no longer receive replies."
      : error.message?.toLowerCase().includes("verified")
        ? "Please verify your email before replying to support."
        : error.message?.toLowerCase().includes("not found")
          ? "That support request could not be found."
          : "We couldn't send your reply. Please try again.";
    replyError(ticketId, message);
  }

  redirect(`/app/support/requests/${encodeURIComponent(ticketId)}?replied=1`);
}
