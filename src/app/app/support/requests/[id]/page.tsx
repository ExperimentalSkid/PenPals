import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SupportAttachmentViewer, { type SupportAttachment } from "@/app/app/support/SupportAttachmentViewer";
import { replyToSupportTicket } from "@/app/app/support/actions";
import SubmitSupportReplyButton from "@/app/app/support/SubmitSupportReplyButton";
import { getPageI18n } from "@/i18n/server";

type SupportRequest = {
  id: string;
  ticket_code?: string;
  subject?: string;
  category?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  messages?: Array<{ id: string; author_name?: string; body?: string; created_at?: string }>;
  attachments?: Array<{ id: string; storage_path?: string; file_name?: string; mime_type?: string; size_bytes?: number; created_at?: string }>;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function labelFor(value: unknown) {
  return String(value ?? "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function categoryLabel(value: unknown, t: (key: string) => string) {
  const category = String(value ?? "other");
  return ({
    account_access: t("app.support.accountLogin"),
    profile: t("app.support.profile"),
    communication: t("app.support.messages"),
    snail_mail: t("app.support.snailMail"),
    privacy_safety: t("app.support.privacySafety"),
    bug_report: t("app.support.bug"),
    feedback: t("app.support.feedback"),
    other: t("app.support.other"),
  } as Record<string, string>)[category] ?? labelFor(category);
}

function statusLabel(value: unknown, t: (key: string) => string) {
  const status = String(value ?? "open");
  return ({ open: t("app.support.open"), waiting_staff: t("app.support.waitingStaff"), waiting_user: t("app.support.waitingYou"), resolved: t("app.support.resolved") } as Record<string, string>)[status] ?? labelFor(status);
}

function dateLabel(value: unknown) {
  return value ? new Date(String(value)).toLocaleString() : "—";
}

function statusClasses(status: string) {
  if (status === "resolved") return "border-[#087456]/20 bg-[#e5f2e9] text-brand";
  if (status === "waiting_user") return "border-[#c8871b]/25 bg-[#fff2d2] text-[#8a5a00]";
  return "border-[#8bbde8]/30 bg-[#e8f2fb] text-[#195b90]";
}

export default async function MySupportRequestDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; replied?: string }> }) {
  const { locale, t } = await getPageI18n();
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  if (!data?.claims?.sub) redirect("/sign-in");

  const { id } = await params;
  const query = await searchParams;
  if (!UUID_PATTERN.test(id)) notFound();
  const { data: result, error } = await db.rpc("get_my_support_ticket", { ticket_uuid: id });
  if (error) throw error;
  if (!result || typeof result !== "object") notFound();
  const ticket = result as SupportRequest;
  const status = String(ticket.status ?? "open");
  const messages = Array.isArray(ticket.messages) ? ticket.messages : [];
  const rawAttachments = Array.isArray(ticket.attachments) ? ticket.attachments : [];
  const attachments: SupportAttachment[] = (await Promise.all(rawAttachments.map(async (attachment) => {
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

  return (
    <main lang={locale} className="min-h-screen w-full bg-[#f7f5ef] px-5 py-8 text-primary sm:px-8 sm:py-10 lg:px-12 lg:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <Link href="/app/support/requests" className="text-sm font-medium text-brand hover:underline">← {t("app.support.backMine")}</Link>
        <header className="mt-10">
          <p className="eyebrow">{t("app.support.supportRequest")}</p>
          <h1 className="page-title-compact">{ticket.subject ?? t("app.support.supportRequest")}</h1>
          <p className="mt-3 font-mono text-sm text-black/50">{ticket.ticket_code ?? t("app.support.supportRequest")}</p>
        </header>

        <section className="mt-8 rounded-2xl border border-black/10 bg-white/35 p-5 shadow-[0_8px_24px_rgba(15,23,42,.03)] sm:p-8" aria-labelledby="support-request-details-heading">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 pb-5">
            <h2 id="support-request-details-heading" className="section-title-large">{t("app.support.details")}</h2>
            <span className={`inline-flex rounded-full border px-3 py-1.5 text-sm font-medium ${statusClasses(status)}`}>{statusLabel(status, t)}</span>
          </div>
          <dl className="mt-6 grid gap-x-8 gap-y-5 text-sm sm:grid-cols-2">
            <div><dt className="text-black/45">{t("app.support.category")}</dt><dd className="mt-1 font-medium text-primary">{categoryLabel(ticket.category, t)}</dd></div>
            <div><dt className="text-black/45">{t("app.support.ticketId")}</dt><dd className="mt-1 font-mono font-semibold text-primary">{ticket.ticket_code ?? "—"}</dd></div>
            <div><dt className="text-black/45">{t("app.support.submitted")}</dt><dd className="mt-1 text-black/65">{dateLabel(ticket.created_at)}</dd></div>
            <div><dt className="text-black/45">{t("app.support.lastUpdated")}</dt><dd className="mt-1 text-black/65">{dateLabel(ticket.updated_at)}</dd></div>
          </dl>
          {query.error && <p className="notice notice-error mt-6" role="alert">{query.error}</p>}
          {query.replied === "1" && <p className="notice notice-success mt-6" role="status">{t("app.support.replySent")}</p>}
        </section>

        <section className="mt-8 rounded-2xl border border-black/10 bg-white/35 p-5 shadow-[0_8px_24px_rgba(15,23,42,.03)] sm:p-8" aria-labelledby="support-conversation-heading">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-black/10 pb-5">
            <div>
              <p className="eyebrow">{t("app.support.conversation")}</p>
              <h2 id="support-conversation-heading" className="section-title-large mt-2">{t("app.support.updates")}</h2>
            </div>
            <p className="text-sm text-black/45">{t("app.support.messageCount", { count: messages.length })}</p>
          </div>
          {messages.length ? (
            <div className="divide-y divide-black/10">
              {messages.map((message, index) => (
                <article key={message.id} className="py-5 first:pt-6 last:pb-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <p className="font-medium text-primary">{message.author_name ?? t("app.support.supportTeam")}</p>
                    <time dateTime={message.created_at} className="text-xs text-black/45">{dateLabel(message.created_at)}</time>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-black/70">{message.body ?? ""}</p>
                  {index === 0 && attachments.length > 0 && <SupportAttachmentViewer attachments={attachments} />}
                </article>
              ))}
            </div>
          ) : (
            <div className="py-8 text-sm leading-6 text-black/55">
              <p>{t("app.support.recorded")}</p>
              {attachments.length > 0 && <SupportAttachmentViewer attachments={attachments} />}
            </div>
          )}
          {status !== "resolved" && (
            <form action={replyToSupportTicket} className="mt-7 border-t border-black/10 pt-6" aria-label={t("app.support.reply")}>
              <input type="hidden" name="ticket_id" value={ticket.id} />
              <input type="hidden" name="submission_token" value={crypto.randomUUID()} />
              <label htmlFor="support-reply-body" className="block text-sm font-medium text-primary">{t("app.support.addReply")}
                <textarea id="support-reply-body" name="body" required maxLength={4000} rows={5} className="field mt-2 w-full resize-y rounded-lg bg-[#fffdfa] leading-7" placeholder={t("app.support.replyPlaceholder")} />
              </label>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-4"><p className="text-xs leading-5 text-black/50">{t("app.support.replyHelp")}</p><SubmitSupportReplyButton /></div>
            </form>
          )}
          {status === "resolved" && <p className="mt-7 border-t border-black/10 pt-5 text-sm leading-6 text-black/55">{t("app.support.resolvedNoReply")}</p>}
        </section>
      </div>
    </main>
  );
}
