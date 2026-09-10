/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { requireAdmin } from "../guard";
import { AdminHeader, AdminPage, StatusChip } from "../AdminChrome";

function SettingRow({ label, value, note, mode = "Server-managed" }: { label: string; value: string; note: string; mode?: string }) {
  return <div className="grid gap-3 border-b border-black/10 py-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
    <div><p className="text-sm font-medium text-primary">{label}</p><p className="mt-1 max-w-2xl text-xs leading-5 text-black/50">{note}</p></div>
    <div className="sm:text-right"><p className="subsection-title">{value}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-[.12em] text-black/40">{mode}</p></div>
  </div>;
}

export default async function AdminSettings() {
  const { db } = await requireAdmin();
  const { data, error } = await db.rpc("admin_settings_summary");
  const settings: any = data && typeof data === "object" ? data : {};
  const destinations = Number(settings.max_friendship_destinations ?? 5);

  return <AdminPage>
    <AdminHeader active="settings" eyebrow="Platform · Administrator only" title="Settings" description="Review global product limits and platform behavior. Values that are not safely configurable are shown as server-managed." isAdmin>
      <StatusChip value={error ? "Unavailable" : "Read only"} tone={error ? "danger" : "neutral"} />
    </AdminHeader>

    {error && <p role="alert" className="notice notice-error mt-6">Platform settings could not be loaded. Refresh before relying on these values.</p>}

    <section className="mt-8" aria-labelledby="product-heading">
      <div><p className="admin-eyebrow">Product configuration</p><h2 id="product-heading" className="section-title mt-1">Profile &amp; discovery</h2><p className="section-description mt-2 max-w-3xl">Values backed by dedicated platform configuration rather than application code.</p></div>
      <div className="mt-5 border-y border-black/10">
        <SettingRow label="Friendship destinations per profile" value={Number.isFinite(destinations) ? destinations.toLocaleString() : "—"} note="Maximum country/region destinations a member can save for friendship discovery." mode="Database configured" />
      </div>
    </section>

    <section className="mt-10 border-t border-black/10 pt-7" aria-labelledby="communication-heading">
      <div><p className="admin-eyebrow">Communication safeguards</p><h2 id="communication-heading" className="section-title mt-1">Introductions &amp; messages</h2><p className="section-description mt-2 max-w-3xl">These limits are enforced at the database boundary and are not editable from Admin yet.</p></div>
      <div className="mt-5 border-y border-black/10">
        <SettingRow label="Introduction length" value="50–500 characters" note="Introductions must also contain at least eight words." />
        <SettingRow label="Introduction rate limit" value="10 / hour" note="Maximum outgoing introductions accepted within a rolling one-hour window." />
        <SettingRow label="Repeated introduction limit" value="3 recipients / 24h" note="Blocks reuse of the same normalized introduction across additional distinct recipients." />
        <SettingRow label="Unanswered instant messages" value="3" note="A sender must wait for a reply before sending a fourth consecutive message." />
        <SettingRow label="Outstanding Snail Mail" value="1 per recipient" note="The database prevents another letter to the same recipient while the previous one remains outstanding." />
      </div>
    </section>

    <section className="mt-10 border-t border-black/10 pt-7" aria-labelledby="security-heading">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="admin-eyebrow">Authentication safeguards</p><h2 id="security-heading" className="section-title mt-1">Login throttling</h2></div><Link href="/app/admin/security" className="text-sm font-semibold text-brand hover:underline">Open Security →</Link></div>
      <div className="mt-5 border-y border-black/10">
        <SettingRow label="Identifier attempts" value="10 / 5 min" note="Username/email/alias resolution is throttled using one-way hashed identifiers." />
        <SettingRow label="Client attempts" value="30 / 5 min" note="Client-level login attempts are independently throttled before authentication continues." />
      </div>
    </section>

    <section className="mt-10 border-t border-black/10 pt-7" aria-labelledby="snail-heading">
      <div><p className="admin-eyebrow">Delivery model</p><h2 id="snail-heading" className="section-title mt-1">Snail Mail transport</h2><p className="section-description mt-2 max-w-3xl">Transport selection and timing multipliers are application behavior, not operator-editable settings.</p></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[['Express','0.65×'],['Air mail','0.85×'],['Standard','1.00×'],['Rail','1.10×'],['Economy','1.25×'],['Sea mail','1.45×'],['Rare pigeon','1.05×']].map(([label,value]) => <div key={label} className="border border-black/10 bg-white/30 px-4 py-4"><p className="text-xs font-semibold uppercase tracking-[.1em] text-black/40">{label}</p><p className="section-title mt-2">{value}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-[.12em] text-black/35">Server-managed</p></div>)}
      </div>
    </section>
  </AdminPage>;
}
