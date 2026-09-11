import { brandedEmailHtml, emailParagraphs, escapeEmailHtml } from "@/lib/email/brand-template";

export class SupportEmailConfigurationError extends Error {}
export class SupportEmailDeliveryError extends Error {}

const RESEND_SEND_EMAIL_ENDPOINT = "https://api.resend.com/emails";
const EMAIL_PATTERN = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;

function cleanSingleLine(value: string | undefined, fallback: string) {
  const raw = value?.trim() || fallback;
  const clean = (raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))
    ? raw.slice(1, -1).trim()
    : raw;
  if (/[\r\n]/.test(clean)) throw new SupportEmailConfigurationError("Email configuration must be single-line.");
  return clean;
}

function supportSender() {
  const explicit = process.env.SUPPORT_EMAIL_FROM?.trim();
  if (explicit) return cleanSingleLine(explicit, "");

  const senderEmail = cleanSingleLine(process.env.SUPABASE_AUTH_SMTP_ADMIN_EMAIL, "no-reply@pen-pals.net");
  const senderName = cleanSingleLine(process.env.SUPABASE_AUTH_SMTP_SENDER_NAME, "Pen-Pals");
  if (!EMAIL_PATTERN.test(senderEmail)) throw new SupportEmailConfigurationError("Support sender email is invalid.");
  return `${senderName} <${senderEmail}>`;
}

function supportReplyTo() {
  const value = process.env.SUPPORT_EMAIL_REPLY_TO?.trim();
  if (!value) return undefined;
  const clean = cleanSingleLine(value, "");
  if (!EMAIL_PATTERN.test(clean)) throw new SupportEmailConfigurationError("Support reply-to email is invalid.");
  return clean;
}

export function buildPublicContactReplyEmail({
  body,
  ticketCode,
}: {
  body: string;
  ticketCode: string;
}) {
  const footer = `\n\n—\nPen-Pals support\nReference: ${ticketCode}`;
  const text = `${body}${footer}`;
  const html = brandedEmailHtml({
    heading: "Pen-Pals support",
    bodyHtml: emailParagraphs(body),
    footerHtml: `<p style="margin:0;">Reference: ${escapeEmailHtml(ticketCode)}</p>`,
  });
  return { text, html };
}

export async function sendPublicContactReplyEmail({
  to,
  subject,
  body,
  ticketCode,
  idempotencyKey,
}: {
  to: string;
  subject: string;
  body: string;
  ticketCode: string;
  idempotencyKey: string;
}) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) throw new SupportEmailConfigurationError("Support email delivery is not configured.");
  if (!EMAIL_PATTERN.test(to)) throw new SupportEmailDeliveryError("Recipient email address is invalid.");

  const { text, html } = buildPublicContactReplyEmail({ body, ticketCode });
  const replyTo = supportReplyTo();
  const response = await fetch(RESEND_SEND_EMAIL_ENDPOINT, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      from: supportSender(),
      to: [to],
      subject,
      html,
      text,
      ...(replyTo ? { reply_to: replyTo } : {}),
      tags: [
        { name: "source", value: "contact_inbox" },
        { name: "ticket", value: ticketCode.toLowerCase() },
      ],
    }),
  });

  if (!response.ok) {
    throw new SupportEmailDeliveryError("Support email could not be sent.");
  }
}
