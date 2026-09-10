import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { submitSupportTicket } from "./actions";
import SubmitSupportButton from "./SubmitSupportButton";
import { getPageI18n } from "@/i18n/server";

const categories = ["account_access","profile","communication","snail_mail","privacy_safety","technical_problem","bug_report","feedback","other"] as const;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function statusLabel(value: unknown) {
  return String(value ?? "").replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function dateLabel(value: unknown) {
  return value ? new Date(String(value)).toLocaleString() : "—";
}

function ConfirmationCard({ ticket, submitted, t }: { ticket: { id: string; ticket_code?: string; subject?: string; status?: string; created_at?: string }; submitted: boolean; t: (key: string, values?: Record<string, string | number>) => string }) {
  return (
    <section id="support-request-confirmation" className="mt-8 rounded-2xl border border-[#087456]/25 bg-white/45 p-5 shadow-[0_8px_24px_rgba(15,23,42,.03)] sm:p-8" aria-labelledby="support-confirmation-heading" role="status">
      <div className="border-b border-black/10 pb-5">
        <p className="eyebrow">{submitted ? t("app.support.requestReceived") : t("app.support.yourRequest")}</p>
        <h2 id="support-confirmation-heading" className="section-title-large mt-2">{submitted ? t("app.support.thanks") : t("app.support.details")}</h2>
        <p className="section-description mt-2">{submitted ? t("app.support.reviewFollow") : t("app.support.latestInfo")}</p>
      </div>
      <dl className="mt-5 grid gap-x-8 gap-y-4 border-b border-black/10 pb-5 text-sm sm:grid-cols-2">
        <div><dt className="text-black/45">{t("app.support.ticketId")}</dt><dd className="mt-1 font-mono font-semibold text-primary">{ticket.ticket_code ?? "—"}</dd></div>
        <div><dt className="text-black/45">{t("app.support.currentStatus")}</dt><dd className="mt-1 font-medium capitalize text-brand">{statusLabel(ticket.status)}</dd></div>
        <div><dt className="text-black/45">{t("app.support.subject")}</dt><dd className="mt-1 font-medium text-primary">{ticket.subject ?? "—"}</dd></div>
        <div><dt className="text-black/45">{t("app.support.submitted")}</dt><dd className="mt-1 text-black/65">{dateLabel(ticket.created_at)}</dd></div>
      </dl>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Link href={`/app/support/requests/${encodeURIComponent(ticket.id)}`} className="btn-primary px-5 py-2.5">{t("app.support.viewRequest")}</Link>
        <Link href="/app/support" className="rounded-md px-3 py-2.5 text-sm font-medium text-black/60 hover:bg-black/[0.04]">{t("app.support.another")}</Link>
      </div>
    </section>
  );
}

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ error?: string; submitted?: string; ticket?: string }> }) {
  const { locale, t } = await getPageI18n();
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
    <main lang={locale} className="min-h-screen w-full bg-[#f7f5ef] px-5 py-8 text-primary sm:px-8 sm:py-10 lg:px-12 lg:py-12">
      <div className="mx-auto w-full max-w-4xl">
        <Link href="/app" className="text-sm font-medium text-brand hover:underline">← {t("app.support.backApp")}</Link>
        <header className="mt-10 max-w-3xl">
          <p className="eyebrow">{t("app.support.eyebrow")}</p>
          <h1 className="page-title">{t("app.support.contact")}</h1>
          <p className="page-description">{t("app.support.intro")}</p>
          <Link href="/app/support/requests" className="mt-4 inline-flex text-sm font-medium text-brand hover:underline">{t("app.support.viewMine")}</Link>
        </header>

        {query.error && <p className="notice notice-error mt-7" role="alert">{query.error}</p>}
        {shouldShowConfirmation && confirmation && <ConfirmationCard ticket={confirmation} submitted={query.submitted === "1"} t={t} />}
        {shouldShowConfirmation && !confirmation && <div className="notice notice-error mt-8" role="alert">{t("app.support.loadRequestError")} <Link href="/app/support" className="font-semibold underline">{t("app.support.returnSupport")}</Link>.</div>}

        {!shouldShowConfirmation && <section className="mt-8 rounded-2xl border border-black/10 bg-white/35 p-5 shadow-[0_8px_24px_rgba(15,23,42,.03)] sm:p-8" aria-labelledby="support-form-heading">
          <div className="border-b border-black/10 pb-5">
            <p className="eyebrow">{t("app.support.newRequest")}</p>
            <h2 id="support-form-heading" className="section-title-large mt-2">{t("app.support.sendRequest")}</h2>
            <p className="section-description mt-2">{t("app.support.safety")}</p>
          </div>
          <form action={submitSupportTicket} className="mt-6 space-y-6">
            <input type="hidden" name="submission_token" value={submissionToken} />
            <label className="block text-sm font-medium text-primary">{t("app.support.category")}<select name="category" required defaultValue="" className="field mt-2 w-full rounded-lg bg-[#fffdfa]"><option value="" disabled>{t("app.support.selectCategory")}</option>{categories.map((value) => <option key={value} value={value}>{value === "account_access" ? t("app.support.accountLogin") : value === "profile" ? t("app.support.profile") : value === "communication" ? t("app.support.messages") : value === "snail_mail" ? t("app.support.snailMail") : value === "privacy_safety" ? t("app.support.privacySafety") : value === "technical_problem" ? t("app.support.technical") : value === "bug_report" ? t("app.support.bug") : value === "feedback" ? t("app.support.feedback") : t("app.support.other")}</option>)}</select></label>
            <label className="block text-sm font-medium text-primary">{t("app.support.subject")}<input name="subject" required minLength={3} maxLength={200} className="field mt-2 w-full rounded-lg bg-[#fffdfa]" placeholder={t("app.support.subjectPlaceholder")} /></label>
            <label className="block text-sm font-medium text-primary">{t("app.support.description")}<textarea name="description" required minLength={10} maxLength={4000} rows={9} className="field mt-2 w-full resize-y rounded-lg bg-[#fffdfa] leading-7" placeholder={t("app.support.descriptionPlaceholder")} /></label>
            <div>
              <label htmlFor="support-attachments" className="block text-sm font-medium text-primary">{t("app.support.attachments")} <span className="font-normal text-black/45">({t("app.support.optional")})</span></label>
              <input id="support-attachments" name="attachments" type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp,text/plain" className="mt-2 block w-full text-sm text-black/60 file:mr-3 file:rounded-md file:border-0 file:bg-[#e7e9df] file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary" />
              <p className="mt-2 text-xs leading-5 text-black/45">{t("app.support.filesHelp")}</p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-black/10 pt-5"><p className="max-w-md text-xs leading-5 text-black/50">{t("app.support.accountAttached")}</p><SubmitSupportButton /></div>
          </form>
        </section>}
      </div>
    </main>
  );
}
