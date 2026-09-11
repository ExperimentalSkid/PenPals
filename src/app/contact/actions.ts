"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getPageI18n } from "@/i18n/server";
import {
  createContactBrowserEnvironmentCorrelation,
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

const CLIENT_METADATA_VERSION = 1;

function clientText(formData: FormData, name: string, max: number) {
  const value = String(formData.get(name) ?? "").trim();
  return value ? value.slice(0, max) : null;
}

function publicContactClientMetadata(formData: FormData) {
  const timezoneValue = clientText(formData, "client_timezone", 100);
  const timezone = timezoneValue && /^[A-Za-z0-9_+.-]+(?:\/[A-Za-z0-9_+.-]+)*$/.test(timezoneValue) ? timezoneValue : null;
  const offsetText = clientText(formData, "client_utc_offset_minutes", 8);
  const offsetValue = offsetText === null ? null : Number(offsetText);
  const utcOffsetMinutes = offsetValue !== null && Number.isInteger(offsetValue) && offsetValue >= -840 && offsetValue <= 840 ? offsetValue : null;
  const timestampValue = clientText(formData, "client_timestamp_utc", 64);
  const timestampUtc = timestampValue && Number.isFinite(Date.parse(timestampValue)) ? timestampValue : null;
  const epochText = clientText(formData, "client_epoch_ms", 24);
  const epochValue = epochText === null ? null : Number(epochText);
  const epochMs = epochValue !== null && Number.isSafeInteger(epochValue) && epochValue >= 0 ? epochValue : null;
  const languageValue = clientText(formData, "client_language", 64);
  const language = languageValue && /^[A-Za-z0-9-]+$/.test(languageValue) ? languageValue : null;
  let languages: string[] = [];
  try {
    const parsed = JSON.parse(clientText(formData, "client_languages", 1000) ?? "[]");
    if (Array.isArray(parsed)) languages = parsed.filter((value): value is string => typeof value === "string" && /^[A-Za-z0-9-]{1,64}$/.test(value)).slice(0, 10);
  } catch {}

  if (!timezone && utcOffsetMinutes === null && !timestampUtc && epochMs === null && !language && languages.length === 0) return null;
  return { source: "browser_form", schema_version: CLIENT_METADATA_VERSION, timezone, utc_offset_minutes: utcOffsetMinutes, timestamp_utc: timestampUtc, epoch_ms: epochMs, language, languages };
}

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
  const serverObserved = publicContactRequestMetadata(await headers());
  const clientReported = publicContactClientMetadata(formData);
  const browserCorrelation = createContactBrowserEnvironmentCorrelation(serverObserved, clientReported);
  const metadata = {
    ...serverObserved,
    request_metadata_version: 3,
    network_client_hash: serverObserved.client_key_hash,
    network_client_hash_version: 1,
    ...(browserCorrelation ? { browser_environment_hash: browserCorrelation.hash, browser_environment_hash_version: browserCorrelation.version } : {}),
    ...(clientReported ? { client_reported: clientReported } : {}),
  };
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
