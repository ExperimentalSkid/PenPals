"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPageI18n } from "@/i18n/server";

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

function clientKeyFromHeaders(requestHeaders: Headers) {
  const forwardedFor = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwardedFor || requestHeaders.get("x-real-ip")?.trim() || requestHeaders.get("cf-connecting-ip")?.trim();
  const userAgent = requestHeaders.get("user-agent")?.trim();
  return [address, userAgent].filter(Boolean).join("|").slice(0, 300);
}

export async function submitPublicContact(formData: FormData) {
  const { t } = await getPageI18n();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const topic = TOPICS[String(formData.get("topic") ?? "").trim().toLowerCase()];
  const subject = String(formData.get("subject") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const website = String(formData.get("website") ?? "").trim();

  if (website) redirect("/contact?sent=1");
  if (name.length > 120) contactError(t("server.contact.nameShorter"));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) contactError(t("server.contact.emailValid"));
  if (!topic) contactError(t("server.contact.topic"));
  if (subject.length < 3 || subject.length > 200) contactError(t("server.contact.subjectLength"));
  if (message.length < 10 || message.length > 4000) contactError(t("server.contact.messageLength"));

  const db = await createClient();
  const requestHeaders = await headers();
  const { error } = await db.rpc("submit_public_contact_ticket", {
    p_name: name || null,
    p_email: email,
    p_category: topic,
    p_subject: subject,
    p_message: message,
    p_client_key: clientKeyFromHeaders(requestHeaders) || null,
  });

  if (error) {
    const lower = error.message?.toLowerCase() ?? "";
    const messageText = lower.includes("wait")
      ? t("server.contact.wait")
      : t("server.contact.failed");
    contactError(messageText);
  }

  redirect("/contact?sent=1");
}
