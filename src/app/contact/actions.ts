"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const topic = TOPICS[String(formData.get("topic") ?? "").trim().toLowerCase()];
  const subject = String(formData.get("subject") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const website = String(formData.get("website") ?? "").trim();

  if (website) redirect("/contact?sent=1");
  if (name.length > 120) contactError("Use a shorter name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) contactError("Enter a valid email address.");
  if (!topic) contactError("Choose a topic.");
  if (subject.length < 3 || subject.length > 200) contactError("Subject must be between 3 and 200 characters.");
  if (message.length < 10 || message.length > 4000) contactError("Message must be between 10 and 4,000 characters.");

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
      ? "Please wait before sending another message."
      : "We couldn't send that message. Please try again.";
    contactError(messageText);
  }

  redirect("/contact?sent=1");
}
