import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthorizedProfilePhoto } from "@/lib/private-avatar-server";
import { getPageI18n } from "@/i18n/server";

type PenPalRow = {
  conversation_id: string;
  pen_pal_id: string;
  username: string | null;
  display_name: string | null;
  age: number | null;
  avatar_path: string | null;
  connected_at: string;
  sent_count: number | string | null;
  received_count: number | string | null;
  last_contact_at: string | null;
  unread: boolean | null;
};

function formatLastContact(value: string | null, locale: string, never: string) {
  if (!value) return never;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return never;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}

export default async function MyPenPalsPage() {
  const { locale, t } = await getPageI18n();
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  const uid = data?.claims?.sub;
  if (!uid) redirect("/sign-in");

  const result = await db.rpc("get_my_pen_pals");
  const rows = (result.data ?? []) as PenPalRow[];
  const penPals = await Promise.all(rows.map(async (row) => ({
    ...row,
    photo: row.avatar_path ? (await getAuthorizedProfilePhoto(db, row.pen_pal_id, uid)).url : null,
  })));

  return <main lang={locale} className="min-h-screen w-full bg-[#f7f5ef] px-5 py-8 text-primary sm:px-8 lg:px-12 lg:py-12">
    <div className="mx-auto w-full max-w-6xl">
      <header className="max-w-3xl">
        <p className="eyebrow">{t("app.penPals.eyebrow")}</p>
        <h1 className="page-title-display mt-3">{t("app.penPals.title")}</h1>
        <p className="mt-4 text-[17px] leading-7 text-black/60">{t("app.penPals.intro")}</p>
      </header>

      {result.error ? <p role="alert" className="notice notice-error mt-8">{t("app.penPals.loadError")}</p> : penPals.length ? (
        <section aria-label={t("app.penPals.list")} className="mt-10 grid gap-5 lg:grid-cols-2">
          {penPals.map((penPal) => {
            const name = penPal.display_name || penPal.username || t("app.penPals.deletedUser");
            const sent = Number(penPal.sent_count ?? 0);
            const received = Number(penPal.received_count ?? 0);
            return <article key={penPal.conversation_id} className="rounded-2xl border border-[#dfddd4] bg-[#fffdf8] p-5 shadow-[0_8px_28px_rgba(35,57,47,.045)] sm:p-6">
              <div className="flex items-start gap-4">
                <Link href={penPal.username ? `/app/profile/${encodeURIComponent(penPal.username)}` : "#"} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border border-black/10 bg-[#e8ece4]">
                  {penPal.photo ? <Image src={penPal.photo} alt="" fill sizes="64px" unoptimized className="object-cover" /> : <span className="flex h-full w-full items-center justify-center font-serif text-2xl text-muted">{name.trim().charAt(0).toUpperCase() || "·"}</span>}
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate font-serif text-2xl text-primary">{name}{typeof penPal.age === "number" ? `, ${penPal.age}` : ""}</h2>
                      {penPal.username && <p className="mt-0.5 truncate text-sm text-black/45">@{penPal.username}</p>}
                    </div>
                    {penPal.unread && <span className="mt-1 inline-flex rounded-full bg-[#e5f0e9] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.12em] text-[#17654f]">{t("app.penPals.unread")}</span>}
                  </div>
                </div>
              </div>

              <dl className="mt-6 grid grid-cols-3 divide-x divide-black/10 border-y border-black/10 py-4 text-center">
                <div className="px-2"><dt className="text-[10px] font-bold uppercase tracking-[.13em] text-black/40">{t("app.penPals.sent")}</dt><dd className="mt-1 font-serif text-2xl text-primary">{sent}</dd></div>
                <div className="px-2"><dt className="text-[10px] font-bold uppercase tracking-[.13em] text-black/40">{t("app.penPals.received")}</dt><dd className="mt-1 font-serif text-2xl text-primary">{received}</dd></div>
                <div className="px-2"><dt className="text-[10px] font-bold uppercase tracking-[.13em] text-black/40">{t("app.penPals.lastContact")}</dt><dd className="mt-1 text-sm font-semibold text-primary">{formatLastContact(penPal.last_contact_at, locale, t("app.penPals.noContact"))}</dd></div>
              </dl>

              <div className="mt-5 flex flex-wrap gap-3">
                <Link href={`/app/messages/${encodeURIComponent(penPal.conversation_id)}`} className="btn-primary inline-flex min-h-10 items-center justify-center rounded-md px-4 py-2 text-sm">{t("app.penPals.openConversation")}</Link>
                {penPal.username && <Link href={`/app/profile/${encodeURIComponent(penPal.username)}`} className="btn-secondary inline-flex min-h-10 items-center justify-center rounded-md px-4 py-2 text-sm">{t("app.penPals.viewProfile")}</Link>}
              </div>
            </article>;
          })}
        </section>
      ) : <section className="mt-10 rounded-2xl border border-black/10 bg-white/35 px-6 py-14 text-center">
        <h2 className="font-serif text-2xl text-primary">{t("app.penPals.emptyTitle")}</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-black/55">{t("app.penPals.emptyBody")}</p>
        <Link href="/app/discover" className="btn-primary mt-6 inline-flex min-h-11 items-center rounded-md px-5 py-2.5 text-sm">{t("app.penPals.discover")}</Link>
      </section>}
    </div>
  </main>;
}
