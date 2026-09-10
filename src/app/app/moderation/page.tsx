import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "../admin/guard";
import { AdminPage } from "../admin/AdminChrome";

type DashboardSummary = Record<string, unknown>;

function count(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function WorkspaceCard({ href, title, description, countValue, featured = false }: { href: string; title: string; description: string; countValue?: number; featured?: boolean }) {
  return <Link href={href} className={`group block border bg-white/35 p-5 transition sm:p-6 ${featured ? "border-[#087456]/30 lg:col-span-2" : "border-black/10"} hover:border-[#087456]/45 hover:bg-white/65`}>
    <div className="flex h-full flex-col justify-between gap-7">
      <div className="flex items-start justify-between gap-5">
        <div className="min-w-0"><p className="admin-eyebrow">Workspace</p><h2 className={`mt-1 font-serif tracking-[-0.015em] text-primary ${featured ? "text-3xl" : "text-2xl"}`}>{title}</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-black/55">{description}</p></div>
        {typeof countValue === "number" ? <div className="shrink-0 text-right"><p className="font-serif text-3xl leading-none text-primary">{countValue.toLocaleString()}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-[.12em] text-black/40">Open</p></div> : null}
      </div>
      <p className="text-sm font-semibold text-brand transition group-hover:translate-x-0.5">Open →</p>
    </div>
  </Link>;
}

export default async function ModeratorWorkspace() {
  const { db, role } = await requireStaff();
  if (role === "admin") redirect("/app/admin");

  const [{ data: summaryData }, { data: supportCount }, { data: contactCount }] = await Promise.all([
    db.rpc("admin_dashboard_summary"),
    db.rpc("staff_support_open_count"),
    db.rpc("staff_contact_open_count"),
  ]);
  const summary = (summaryData && typeof summaryData === "object" ? summaryData : {}) as DashboardSummary;
  const caseCounts = [
    ["new_cases", "New"],
    ["triage_cases", "Triage"],
    ["investigating_cases", "Investigating"],
    ["waiting_cases", "Waiting"],
  ] as const;
  const openCases = caseCounts.reduce((total, [key]) => total + count(summary[key]), 0);

  return <AdminPage>
    <div className="flex flex-wrap items-center justify-between gap-4"><Link href="/app/discover" className="admin-back-link">← Return to app</Link><span className="admin-access-label">Moderation workspace</span></div>
    <header className="mt-8 border-b border-black/10 pb-8 sm:pb-10"><div className="max-w-3xl"><p className="admin-eyebrow">Trust &amp; safety</p><h1 className="admin-title">Moderator Panel</h1><p className="admin-description">Review safety reports, work assigned cases, and handle shared support queues.</p></div></header>

    <section className="mt-8" aria-labelledby="moderation-queue-heading">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="admin-eyebrow">Case workload</p><h2 id="moderation-queue-heading" className="section-title mt-1">Active cases</h2></div><p className="text-sm text-black/45">{openCases.toLocaleString()} open cases</p></div>
      <div className="mt-4 grid overflow-hidden border-y border-black/10 bg-white/20 sm:grid-cols-2 lg:grid-cols-4">{caseCounts.map(([key, label]) => <Link key={key} href={`/app/admin/cases?status=${key.replace("_cases", "")}`} className="border-b border-black/10 px-5 py-4 transition hover:bg-white/60 sm:border-r lg:border-b-0 lg:last:border-r-0"><p className="section-title-large">{count(summary[key]).toLocaleString()}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-[.12em] text-black/45">{label}</p></Link>)}</div>
    </section>

    <section className="mt-8 grid gap-4 lg:grid-cols-2" aria-label="Moderation workspaces">
      <WorkspaceCard featured href="/app/admin/cases" title="Mod Inbox" description="Work moderation cases from triage through resolution. Claim a case, review preserved evidence, record notes, and escalate when administrator review is needed." countValue={openCases} />
      <WorkspaceCard href="/app/admin/reports" title="Reports" description="Review individual reports before or alongside a moderation case. See the reported content, reason, and available report context." />
      <WorkspaceCard href="/app/admin/support" title="Support Inbox" description="Respond to member support requests, claim tickets, and keep their status up to date." countValue={count(supportCount)} />
      <WorkspaceCard href="/app/admin/contact" title="Contact Inbox" description="Review and respond to messages submitted through the public contact form." countValue={count(contactCount)} />
      <WorkspaceCard href="/app/admin/analytics" title="Analytics" description="View read-only activity and moderation workload metrics without opening private message content." />
    </section>
    <p className="mt-10 border-t border-black/10 pt-5 text-xs leading-5 text-black/45">Administrator-only account, staff, verification, rule, and system controls are not available in the moderator workspace.</p>
  </AdminPage>;
}
