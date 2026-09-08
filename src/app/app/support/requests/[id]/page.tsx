import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SupportAttachmentViewer, { type SupportAttachment } from "@/app/app/support/SupportAttachmentViewer";
import { replyToSupportTicket } from "@/app/app/support/actions";
import SubmitSupportReplyButton from "@/app/app/support/SubmitSupportReplyButton";

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

function statusLabel(value: unknown) {
  const status = String(value ?? "open");
  return ({ open: "Open", waiting_staff: "Waiting for staff", waiting_user: "Waiting for you", resolved: "Resolved" } as Record<string, string>)[status] ?? labelFor(status);
}

function dateLabel(value: unknown) {
  return value ? new Date(String(value)).toLocaleString() : "—";
}

function statusClasses(status: string) {
  if (status === "resolved") return "border-[#087456]/20 bg-[#e5f2e9] text-[#075d46]";
  if (status === "waiting_user") return "border-[#c8871b]/25 bg-[#fff2d2] text-[#8a5a00]";
  return "border-[#8bbde8]/30 bg-[#e8f2fb] text-[#195b90]";
}

export default async function MySupportRequestDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; replied?: string }> }) {
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  if (!data?.claims?.sub) redirect("/sign-in");

  const { id } = await params;
  const query = await searchParams;
  if (!UUID_PATTERN.test(id)) notFound();
  const { data: result, error } = await db.rpc("get_my_support_ticket", { ticket_uuid: id });
  if (error || !result || typeof result !== "object") notFound();
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
    <main className="min-h-screen w-full bg-[#f7f5ef] px-5 py-8 text-[#16251f] sm:px-8 sm:py-10 lg:px-12 lg:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <Link href="/app/support/requests" className="text-sm font-medium text-[#087456] hover:underline">← Back to my support requests</Link>
        <header className="mt-10">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-[#087456]">Support request</p>
          <h1 className="mt-3 font-serif text-4xl tracking-[-.02em] text-[#10231d] sm:text-5xl">{ticket.subject ?? "Support request"}</h1>
          <p className="mt-3 font-mono text-sm text-black/50">{ticket.ticket_code ?? "Support request"}</p>
        </header>

        <section className="mt-8 rounded-2xl border border-black/10 bg-white/35 p-5 shadow-[0_8px_24px_rgba(15,23,42,.03)] sm:p-8" aria-labelledby="support-request-details-heading">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 pb-5">
            <h2 id="support-request-details-heading" className="font-serif text-3xl text-[#10231d]">Request details</h2>
            <span className={`inline-flex rounded-full border px-3 py-1.5 text-sm font-medium ${statusClasses(status)}`}>{statusLabel(status)}</span>
          </div>
          <dl className="mt-6 grid gap-x-8 gap-y-5 text-sm sm:grid-cols-2">
            <div><dt className="text-black/45">Category</dt><dd className="mt-1 font-medium text-[#10231d]">{labelFor(ticket.category) || "Other"}</dd></div>
            <div><dt className="text-black/45">Ticket ID</dt><dd className="mt-1 font-mono font-semibold text-[#10231d]">{ticket.ticket_code ?? "—"}</dd></div>
            <div><dt className="text-black/45">Submitted</dt><dd className="mt-1 text-black/65">{dateLabel(ticket.created_at)}</dd></div>
            <div><dt className="text-black/45">Last updated</dt><dd className="mt-1 text-black/65">{dateLabel(ticket.updated_at)}</dd></div>
          </dl>
          {query.error && <p className="mt-6 border-l-2 border-red-400 px-3 py-2 text-sm text-red-700" role="alert">{query.error}</p>}
          {query.replied === "1" && <p className="mt-6 border-l-2 border-[#087456] px-3 py-2 text-sm text-[#075d46]" role="status">Your reply was sent to the support team.</p>}
        </section>

        <section className="mt-8 rounded-2xl border border-black/10 bg-white/35 p-5 shadow-[0_8px_24px_rgba(15,23,42,.03)] sm:p-8" aria-labelledby="support-conversation-heading">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-black/10 pb-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.16em] text-[#087456]">Conversation</p>
              <h2 id="support-conversation-heading" className="mt-2 font-serif text-3xl text-[#10231d]">Support updates</h2>
            </div>
            <p className="text-sm text-black/45">{messages.length} message{messages.length === 1 ? "" : "s"}</p>
          </div>
          {messages.length ? (
            <div className="divide-y divide-black/10">
              {messages.map((message, index) => (
                <article key={message.id} className="py-5 first:pt-6 last:pb-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <p className="font-medium text-[#10231d]">{message.author_name ?? "Support team"}</p>
                    <time dateTime={message.created_at} className="text-xs text-black/45">{dateLabel(message.created_at)}</time>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-black/70">{message.body ?? ""}</p>
                  {index === 0 && attachments.length > 0 && <SupportAttachmentViewer attachments={attachments} />}
                </article>
              ))}
            </div>
          ) : (
            <div className="py-8 text-sm leading-6 text-black/55">
              <p>Your request is safely recorded. Support will add an update here when available.</p>
              {attachments.length > 0 && <SupportAttachmentViewer attachments={attachments} />}
            </div>
          )}
          {status !== "resolved" && (
            <form action={replyToSupportTicket} className="mt-7 border-t border-black/10 pt-6" aria-label="Reply to support">
              <input type="hidden" name="ticket_id" value={ticket.id} />
              <input type="hidden" name="submission_token" value={crypto.randomUUID()} />
              <label htmlFor="support-reply-body" className="block text-sm font-medium text-[#263b33]">Add a reply
                <textarea id="support-reply-body" name="body" required maxLength={4000} rows={5} className="field mt-2 w-full resize-y rounded-lg bg-[#fffdfa] leading-7" placeholder="Write your reply to the support team." />
              </label>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-4"><p className="text-xs leading-5 text-black/50">Replies are visible to the support team and become part of this request.</p><SubmitSupportReplyButton /></div>
            </form>
          )}
          {status === "resolved" && <p className="mt-7 border-t border-black/10 pt-5 text-sm leading-6 text-black/55">This request is resolved and can no longer receive replies.</p>}
        </section>
      </div>
    </main>
  );
}
