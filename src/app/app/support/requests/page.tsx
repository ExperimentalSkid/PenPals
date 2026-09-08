import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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

export default async function MySupportRequestsPage() {
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  if (!data?.claims?.sub) redirect("/sign-in");

  const { data: rows, error } = await db.rpc("get_my_support_tickets");
  const tickets = Array.isArray(rows) ? rows as SupportRequest[] : [];

  return (
    <main className="min-h-screen w-full bg-[#f7f5ef] px-5 py-8 text-[#16251f] sm:px-8 sm:py-10 lg:px-12 lg:py-12">
      <div className="mx-auto w-full max-w-4xl">
        <Link href="/app/support" className="text-sm font-medium text-[#087456] hover:underline">← Back to support</Link>
        <header className="mt-10 max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-[#087456]">Help &amp; support</p>
          <h1 className="mt-3 font-serif text-5xl tracking-[-.02em] text-[#10231d] sm:text-6xl">My support requests</h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-black/60 sm:text-lg">Track the requests you&apos;ve sent us.</p>
        </header>

        {error && <p className="mt-7 border-l-2 border-red-400 px-3 py-2 text-sm text-red-700" role="alert">Your support requests could not be loaded. Please refresh and try again.</p>}

        <section className="mt-8 overflow-hidden rounded-2xl border border-black/10 bg-white/35 shadow-[0_8px_24px_rgba(15,23,42,.03)]" aria-labelledby="support-requests-heading">
          <div className="border-b border-black/10 px-5 py-5 sm:px-8">
            <h2 id="support-requests-heading" className="font-serif text-3xl text-[#10231d]">Your requests</h2>
          </div>
          {tickets.length ? (
            <div className="divide-y divide-black/10">
              {tickets.map((ticket) => {
                const status = String(ticket.status ?? "open");
                return (
                  <Link key={ticket.id} href={`/app/support/requests/${ticket.id}`} className="block px-5 py-5 transition hover:bg-white/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#087456] sm:px-8">
                    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1.35fr)_170px_160px_150px] lg:items-center lg:gap-6">
                      <div className="min-w-0">
                        <p className="font-mono text-xs font-semibold tracking-wide text-[#087456]">{ticket.ticket_code ?? "Support request"}</p>
                        <h3 className="mt-1 truncate text-base font-semibold text-[#10231d]">{ticket.subject ?? "Untitled request"}</h3>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[.12em] text-black/40">Category</p>
                        <p className="mt-1 text-sm text-black/70">{labelFor(ticket.category) || "Other"}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[.12em] text-black/40">Status</p>
                        <span className={`mt-1 inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusClasses(status)}`}>{statusLabel(status)}</span>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[.12em] text-black/40">Last updated</p>
                        <p className="mt-1 text-sm text-black/60">{dateLabel(ticket.updated_at)}</p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="px-5 py-12 text-center sm:px-8">
              <p className="font-serif text-2xl text-[#10231d]">You haven&apos;t submitted any support requests yet.</p>
              <p className="mt-2 text-sm text-black/55">Need help? Contact our support team.</p>
              <Link href="/app/support" className="btn-primary mt-5 inline-flex px-5 py-2.5">Contact support</Link>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
