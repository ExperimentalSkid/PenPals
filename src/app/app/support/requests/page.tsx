import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPageI18n } from "@/i18n/server";

type SupportRequest = {
  id: string;
  ticket_code?: string;
  subject?: string;
  category?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
};

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

export default async function MySupportRequestsPage() {
  const { locale, t } = await getPageI18n();
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  if (!data?.claims?.sub) redirect("/sign-in");

  const { data: rows, error } = await db.rpc("get_my_support_tickets");
  const tickets = Array.isArray(rows) ? rows as SupportRequest[] : [];

  return (
    <main lang={locale} className="min-h-screen w-full bg-[#f7f5ef] px-5 py-8 text-primary sm:px-8 sm:py-10 lg:px-12 lg:py-12">
      <div className="mx-auto w-full max-w-4xl">
        <Link href="/app/support" className="text-sm font-medium text-brand hover:underline">← {t("app.support.backSupport")}</Link>
        <header className="mt-10 max-w-3xl">
          <p className="eyebrow">{t("app.support.eyebrow")}</p>
          <h1 className="page-title">{t("app.support.myRequests")}</h1>
          <p className="page-description">{t("app.support.track")}</p>
        </header>

        {error && <p className="notice notice-error mt-7" role="alert">{t("app.support.loadMineError")}</p>}

        <section className="mt-8 overflow-hidden rounded-2xl border border-black/10 bg-white/35 shadow-[0_8px_24px_rgba(15,23,42,.03)]" aria-labelledby="support-requests-heading">
          <div className="border-b border-black/10 px-5 py-5 sm:px-8">
            <h2 id="support-requests-heading" className="section-title-large">{t("app.support.yourRequests")}</h2>
          </div>
          {tickets.length ? (
            <div className="divide-y divide-black/10">
              {tickets.map((ticket) => {
                const status = String(ticket.status ?? "open");
                return (
                  <Link key={ticket.id} href={`/app/support/requests/${ticket.id}`} className="block px-5 py-5 transition hover:bg-white/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#087456] sm:px-8">
                    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1.35fr)_170px_160px_150px] lg:items-center lg:gap-6">
                      <div className="min-w-0">
                        <p className="font-mono text-xs font-semibold tracking-wide text-brand">{ticket.ticket_code ?? t("app.support.supportRequest")}</p>
                        <h3 className="mt-1 truncate text-base font-semibold text-primary">{ticket.subject ?? t("app.support.untitled")}</h3>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[.12em] text-black/40">{t("app.support.category")}</p>
                        <p className="mt-1 text-sm text-black/70">{categoryLabel(ticket.category, t)}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[.12em] text-black/40">{t("app.support.status")}</p>
                        <span className={`mt-1 inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusClasses(status)}`}>{statusLabel(status, t)}</span>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[.12em] text-black/40">{t("app.support.lastUpdated")}</p>
                        <p className="mt-1 text-sm text-black/60">{dateLabel(ticket.updated_at)}</p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="px-5 py-12 text-center sm:px-8">
              <p className="section-title">{t("app.support.none")}</p>
              <p className="mt-2 text-sm text-black/55">{t("app.support.needHelp")}</p>
              <Link href="/app/support" className="btn-primary mt-5 inline-flex px-5 py-2.5">{t("app.support.contact")}</Link>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
