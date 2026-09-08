import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { submitSupportTicket } from "./actions";
import SubmitSupportButton from "./SubmitSupportButton";

const categories = [
  ["account_access", "Account & login"],
  ["profile", "Profile"],
  ["communication", "Messages"],
  ["snail_mail", "Snail Mail"],
  ["privacy_safety", "Privacy & safety"],
  ["technical_problem", "Technical problem"],
  ["bug_report", "Bug report"],
  ["feedback", "Feedback"],
  ["other", "Other"],
] as const;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function statusLabel(value: unknown) {
  return String(value ?? "").replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function dateLabel(value: unknown) {
  return value ? new Date(String(value)).toLocaleString() : "—";
}

function ConfirmationCard({ ticket, submitted }: { ticket: { id: string; ticket_code?: string; subject?: string; status?: string; created_at?: string }; submitted: boolean }) {
  return (
    <section id="support-request-confirmation" className="mt-8 rounded-2xl border border-[#087456]/25 bg-white/45 p-5 shadow-[0_8px_24px_rgba(15,23,42,.03)] sm:p-8" aria-labelledby="support-confirmation-heading" role="status">
      <div className="border-b border-black/10 pb-5">
        <p className="text-xs font-bold uppercase tracking-[.16em] text-[#087456]">{submitted ? "Request received" : "Your support request"}</p>
        <h2 id="support-confirmation-heading" className="mt-2 font-serif text-3xl text-[#10231d]">{submitted ? "Thanks — we have your request." : "Request details"}</h2>
        <p className="mt-2 text-sm leading-6 text-black/60">{submitted ? "Our team will review it and follow up here when support replies." : "This is the latest server-confirmed information for your request."}</p>
      </div>
      <dl className="mt-5 grid gap-x-8 gap-y-4 border-b border-black/10 pb-5 text-sm sm:grid-cols-2">
        <div><dt className="text-black/45">Ticket ID</dt><dd className="mt-1 font-mono font-semibold text-[#10231d]">{ticket.ticket_code ?? "—"}</dd></div>
        <div><dt className="text-black/45">Current status</dt><dd className="mt-1 font-medium capitalize text-[#075d46]">{statusLabel(ticket.status)}</dd></div>
        <div><dt className="text-black/45">Subject</dt><dd className="mt-1 font-medium text-[#10231d]">{ticket.subject ?? "—"}</dd></div>
        <div><dt className="text-black/45">Submitted</dt><dd className="mt-1 text-black/65">{dateLabel(ticket.created_at)}</dd></div>
      </dl>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Link href={`/app/support/requests/${encodeURIComponent(ticket.id)}`} className="btn-primary px-5 py-2.5">View request</Link>
        <Link href="/app/support" className="rounded-md px-3 py-2.5 text-sm font-medium text-black/60 hover:bg-black/[0.04]">Submit another request</Link>
      </div>
    </section>
  );
}

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ error?: string; submitted?: string; ticket?: string }> }) {
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  if (!data?.claims?.sub) redirect("/sign-in");
  const query = await searchParams;
  const ticketId = typeof query.ticket === "string" && UUID_PATTERN.test(query.ticket) ? query.ticket : null;
  const ticketQuery = ticketId ? await db.rpc("get_my_support_ticket_confirmation", { ticket_uuid: ticketId }) : { data: null, error: null };
  const confirmation = ticketQuery.data && typeof ticketQuery.data === "object" ? ticketQuery.data as { id: string; ticket_code?: string; subject?: string; status?: string; created_at?: string } : null;
  const submissionToken = crypto.randomUUID();
  const shouldShowConfirmation = Boolean(query.submitted === "1" || ticketId);

  return (
    <main className="min-h-screen w-full bg-[#f7f5ef] px-5 py-8 text-[#16251f] sm:px-8 sm:py-10 lg:px-12 lg:py-12">
      <div className="mx-auto w-full max-w-4xl">
        <Link href="/app" className="text-sm font-medium text-[#087456] hover:underline">← Back to app</Link>
        <header className="mt-10 max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-[#087456]">Help &amp; support</p>
          <h1 className="mt-3 font-serif text-5xl tracking-[-.02em] text-[#10231d] sm:text-6xl">Contact support</h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-black/60 sm:text-lg">Tell us what happened and we&apos;ll take a look.</p>
          <Link href="/app/support/requests" className="mt-4 inline-flex text-sm font-medium text-[#087456] hover:underline">View my support requests →</Link>
        </header>

        {query.error && <p className="mt-7 border-l-2 border-red-400 px-3 py-2 text-sm text-red-700" role="alert">{query.error}</p>}
        {shouldShowConfirmation && confirmation && <ConfirmationCard ticket={confirmation} submitted={query.submitted === "1"} />}
        {shouldShowConfirmation && !confirmation && <div className="mt-8 border-l-2 border-red-400 px-3 py-2 text-sm text-red-700" role="alert">We couldn&apos;t load that support request. It may not belong to this account or may no longer be available. <Link href="/app/support" className="font-semibold underline">Return to support</Link>.</div>}

        {!shouldShowConfirmation && <section className="mt-8 rounded-2xl border border-black/10 bg-white/35 p-5 shadow-[0_8px_24px_rgba(15,23,42,.03)] sm:p-8" aria-labelledby="support-form-heading">
          <div className="border-b border-black/10 pb-5">
            <p className="text-xs font-bold uppercase tracking-[.16em] text-[#087456]">New request</p>
            <h2 id="support-form-heading" className="mt-2 font-serif text-3xl text-[#10231d]">Send a support request</h2>
            <p className="mt-2 text-sm leading-6 text-black/60">Don&apos;t include passwords or other sensitive information.</p>
          </div>
          <form action={submitSupportTicket} className="mt-6 space-y-6">
            <input type="hidden" name="submission_token" value={submissionToken} />
            <label className="block text-sm font-medium text-[#263b33]">Category<select name="category" required defaultValue="" className="field mt-2 w-full rounded-lg bg-[#fffdfa]"><option value="" disabled>Select a category</option>{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="block text-sm font-medium text-[#263b33]">Subject<input name="subject" required minLength={3} maxLength={200} className="field mt-2 w-full rounded-lg bg-[#fffdfa]" placeholder="A short summary of the issue" /></label>
            <label className="block text-sm font-medium text-[#263b33]">Description<textarea name="description" required minLength={10} maxLength={4000} rows={9} className="field mt-2 w-full resize-y rounded-lg bg-[#fffdfa] leading-7" placeholder="Tell us what happened, what you expected, and how we can reproduce it." /></label>
            <div>
              <label htmlFor="support-attachments" className="block text-sm font-medium text-[#263b33]">Attachments <span className="font-normal text-black/45">(optional)</span></label>
              <input id="support-attachments" name="attachments" type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp,text/plain" className="mt-2 block w-full text-sm text-black/60 file:mr-3 file:rounded-md file:border-0 file:bg-[#e7e9df] file:px-3 file:py-2 file:text-sm file:font-medium file:text-[#263b33]" />
              <p className="mt-2 text-xs leading-5 text-black/45">Up to 3 files, 10 MB each. PDF, JPG, PNG, WebP, or plain text.</p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-black/10 pt-5"><p className="max-w-md text-xs leading-5 text-black/50">Your account details are attached automatically, so you don&apos;t need to repeat them.</p><SubmitSupportButton /></div>
          </form>
        </section>}
      </div>
    </main>
  );
}
