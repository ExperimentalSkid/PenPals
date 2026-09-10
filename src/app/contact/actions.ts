"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getPageI18n } from "@/i18n/server";
import {
  createContactVerificationServiceClient,
  createContactVerificationToken,
  sendContactVerificationEmail,
} from "@/lib/contact-verification";
import { publicContactRequestMetadata } from "./request-metadata";

const TOPICS: Record<string, string> = {
  account_access: "account_access",
  privacy_safety: "privacy_safety",
  bug_report: "bug_report",
  feedback: "feedback",
  other: "other",
};

function contactError(message: string): never {
  redirect(`/contact?error=${encodeURIComponent(message)}`);
}

export async function submitPublicContact(formData: FormData) {
  const { t } = await getPageI18n();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const topic = TOPICS[String(formData.get("topic") ?? "").trim().toLowerCase()];
  const subject = String(formData.get("subject") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const website = String(formData.get("website") ?? "").trim();

  if (website) redirect("/contact?verify=1");
  if (name.length > 120) contactError(t("server.contact.nameShorter"));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) contactError(t("server.contact.emailValid"));
  if (!topic) contactError(t("server.contact.topic"));
  if (subject.length < 3 || subject.length > 200) contactError(t("server.contact.subjectLength"));
  if (message.length < 10 || message.length > 4000) contactError(t("server.contact.messageLength"));

  const service = createContactVerificationServiceClient();
  const { token, tokenHash } = createContactVerificationToken();
  const metadata = publicContactRequestMetadata(await headers());
  const { data: pendingId, error } = await service.rpc("create_public_contact_verification", {
    p_name: name || null,
    p_email: email,
    p_category: topic,
    p_subject: subject,
    p_message: message,
    p_token_hash: tokenHash,
    p_request_metadata: metadata,
  });
  if (error || typeof pendingId !== "string") {
    const lower = error?.message?.toLowerCase() ?? "";
    contactError(lower.includes("wait") ? t("server.contact.wait") : t("server.contact.failed"));
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!siteUrl) contactError(t("server.contact.failed"));
  const verifyUrl = new URL("/contact/verify", siteUrl);
  verifyUrl.searchParams.set("submission", pendingId);
  verifyUrl.searchParams.set("token", token);
  try {
    await sendContactVerificationEmail({ to: email, verificationUrl: verifyUrl.toString(), submissionId: pendingId });
  } catch {
    await service.from("public_contact_pending_verifications").delete().eq("id", pendingId);
    contactError(t("server.contact.failed"));
  }

  redirect("/contact?verify=1");
}
