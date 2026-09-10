import { createHash, randomBytes } from "node:crypto";
import nodemailer from "nodemailer";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const EMAIL_PATTERN = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;

export function createContactVerificationToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashContactVerificationToken(token) };
}

export function hashContactVerificationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function contactClientKey(metadata: Record<string, string | null | undefined>) {
  return [metadata.ip, metadata.user_agent].filter(Boolean).join("|").slice(0, 300);
}

export function hashContactClientKey(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function createContactVerificationServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!key || !url) throw new Error("Contact verification service is unavailable.");
  return createSupabaseClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function smtpValue(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

export async function sendContactVerificationEmail({ to, verificationUrl, submissionId }: { to: string; verificationUrl: string; submissionId: string }) {
  if (!EMAIL_PATTERN.test(to)) throw new Error("Invalid contact verification recipient.");
  const port = Number(smtpValue("SMTP_PORT"));
  const transport = nodemailer.createTransport({
    host: smtpValue("SMTP_HOST"),
    port,
    secure: port === 465,
    auth: { user: smtpValue("SMTP_USER"), pass: smtpValue("SMTP_PASS") },
  });
  const fromEmail = smtpValue("SMTP_ADMIN_EMAIL");
  const senderName = process.env.SMTP_SENDER_NAME?.trim() || "Pen-Pals";
  const text = `Verify your email to send your message to pen-pals.net:\n\n${verificationUrl}\n\nThis link expires in 1 hour. If you did not submit the contact form, ignore this email.`;
  const html = `<p>Verify your email to send your message to pen-pals.net.</p><p><a href="${verificationUrl}">Verify email and send message</a></p><p>This link expires in 1 hour. If you did not submit the contact form, ignore this email.</p>`;
  await transport.sendMail({
    from: `${senderName} <${fromEmail}>`,
    to,
    subject: "Verify your email to contact pen-pals.net",
    text,
    html,
    headers: { "X-PenPals-Contact-Verification": submissionId },
  });
}
