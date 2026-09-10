"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getPageI18n } from "@/i18n/server";

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
  const { t } = await getPageI18n();
  const db = await createClient();
  const { data: claimsData } = await db.auth.getClaims();
  const uid = claimsData?.claims?.sub;
  if (!uid) redirect("/sign-in");

  const category = CATEGORY_MAP[String(formData.get("category") ?? "").trim().toLowerCase()];
  const subject = String(formData.get("subject") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const submissionTokenValue = String(formData.get("submission_token") ?? "").trim();
  const submissionToken = UUID_PATTERN.test(submissionTokenValue) ? submissionTokenValue : null;
  if (!category) returnError(t("server.support.chooseCategory"));
  if (subject.length < 3 || subject.length > 200) returnError(t("server.support.subjectLength"));
  if (description.length < 10 || description.length > 4000) returnError(t("server.support.descriptionLength"));

  const files = formData.getAll("attachments").filter((value): value is File => value instanceof File && value.size > 0);
  if (files.length > MAX_ATTACHMENTS) returnError(t("server.support.attachmentCount", { count: MAX_ATTACHMENTS }));
  if (files.some((file) => file.size > MAX_ATTACHMENT_BYTES || !ALLOWED_TYPES.has(file.type))) {
    returnError(t("server.support.attachmentType"));
  }

  const uploadedPaths: string[] = [];
  const attachments = [] as Array<{ storage_path: string; file_name: string; mime_type: string; size_bytes: number }>;
  for (const file of files) {
    const extension = EXTENSIONS[file.type];
    const storagePath = `${uid}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await db.storage.from("support-attachments").upload(storagePath, file, { contentType: file.type, upsert: false });
    if (uploadError) {
      await cleanupPaths(db, uploadedPaths);
      returnError(t("server.support.uploadFailed"));
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
      ? t("server.support.verifyEmail")
      : error.message?.toLowerCase().includes("unavailable")
        ? t("server.support.accountUnavailable")
        : t("server.support.submitFailed");
    returnError(message);
  }

  redirect(`/app/support?submitted=1&ticket=${encodeURIComponent(String(ticketId))}`);
}

export async function replyToSupportTicket(formData: FormData) {
  const { t } = await getPageI18n();
  const db = await createClient();
  const { data: claimsData } = await db.auth.getClaims();
  const uid = claimsData?.claims?.sub;
  if (!uid) redirect("/sign-in");

  const ticketId = String(formData.get("ticket_id") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const submissionTokenValue = String(formData.get("submission_token") ?? "").trim();
  const submissionToken = UUID_PATTERN.test(submissionTokenValue) ? submissionTokenValue : null;
  if (!UUID_PATTERN.test(ticketId)) replyError(ticketId, t("server.support.notFound"));
  if (body.length < 1 || body.length > 4000) replyError(ticketId, t("server.support.replyLength"));
  if (!submissionToken) replyError(ticketId, t("server.support.replyRetry"));

  const { error } = await db.rpc("reply_to_support_ticket", {
    ticket_uuid: ticketId,
    p_body: body,
    p_submission_token: submissionToken,
  });
  if (error) {
    const message = error.message?.toLowerCase().includes("closed")
      ? t("server.support.closed")
      : error.message?.toLowerCase().includes("verified")
        ? t("server.support.verifyReply")
        : error.message?.toLowerCase().includes("not found")
          ? t("server.support.notFound")
          : t("server.support.replyFailed");
    replyError(ticketId, message);
  }

  redirect(`/app/support/requests/${encodeURIComponent(ticketId)}?replied=1`);
}
