/* eslint-disable @typescript-eslint/no-explicit-any */
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isPrivateAvatarPath, isSignedAvatarUrl } from "@/lib/avatar";
import { countryNameForCode } from "@/lib/countries";
import CountryFlag from "@/app/components/CountryFlag";
import IntroductionSort from "./IntroductionSort";
import { replyToIntroduction, declineIntroduction } from "@/app/app/messages/actions";
import { submitReport } from "@/app/app/reports/actions";
import { getPageI18n } from "@/i18n/server";

type SearchValue = string | string[] | undefined;

function first(value: SearchValue) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

type IntroIconName = "sprout" | "book" | "send" | "shield" | "sparkle" | "clock";

function IntroIcon({ name }: { name: IntroIconName }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0" {...common}>
    {name === "sprout" && <><path d="M12 20V9" /><path d="M12 13c-4.5 0-7-2.3-7-6 4.7 0 7 2 7 6ZM12 10c0-4.2 2.6-6.8 7-7 0 4.4-2.7 7-7 7Z" /></>}
    {name === "book" && <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z" /><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5v-16Z" /></>}
    {name === "send" && <><path d="m21 3-7.6 18-3.1-7.3L3 10.6 21 3Z" /><path d="m10.3 13.7 5.1-5.1" /></>}
    {name === "shield" && <><path d="M12 3 20 6v5.5c0 4.7-3.1 7.8-8 9.5-4.9-1.7-8-4.8-8-9.5V6l8-3Z" /><path d="m8.5 12 2.2 2.2 4.8-5" /></>}
    {name === "sparkle" && <><path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3Z" /><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z" /></>}
    {name === "clock" && <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3.2 2" /></>}
  </svg>;
}

function dateLabel(value: string) {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default async function Introductions({ searchParams }: { searchParams?: Promise<Record<string, SearchValue>> }) {
  const { locale, t } = await getPageI18n();
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  const uid = data?.claims?.sub;
  if (!uid) redirect("/sign-in");

  const params = searchParams ? await searchParams : {};
  const errorMessage = first(params.error);
  const requestedStatus = first(params.status);
  const activeStatus: "all" | "pending" | "replied" = ["pending", "replied"].includes(requestedStatus) ? requestedStatus as "pending" | "replied" : "all";
  const requestedSort = first(params.sort);
  const activeSort = requestedSort === "oldest" ? "oldest" : "newest";
  const { data: rows, error: introductionsError } = await db.from("conversation_introductions")
    .select("id,sender_id,recipient_id,icebreaker,created_at,status,conversation_id_legacy")
    .or(`sender_id.eq.${uid},recipient_id.eq.${uid}`)
    .order("created_at", { ascending: activeSort === "oldest" });
  const allRows = introductionsError ? [] : rows ?? [];
  const visibleRows = activeStatus === "all" ? allRows : allRows.filter((row: any) => row.status === activeStatus);
  const pendingCount = allRows.filter((row: any) => row.status === "pending").length;
  const repliedCount = allRows.filter((row: any) => row.status === "replied").length;
  const personIds = [...new Set(allRows.map((row: any) => row.sender_id === uid ? row.recipient_id : row.sender_id))];

  const visibleById = new Map<string, any>();
  await Promise.all(personIds.map(async (personId) => {
    const { data: identityRows } = await db.rpc("resolve_profile_identity", { target_user: personId });
    const identity = Array.isArray(identityRows) ? identityRows[0] : identityRows;
    if (!identity) return;

    // The identity RPC remains the authorization boundary for photos. The
    // public profile RPC supplies only the same already-public location data.
    const { data: publicProfile } = identity.username
      ? await db.rpc("get_public_profile", { target_username: identity.username })
      : { data: null };
    const avatarPath = identity.avatar_path ?? publicProfile?.avatar_path ?? null;
    let photo: string | null = null;
    if (avatarPath && isPrivateAvatarPath(avatarPath, identity.id)) {
      photo = (await db.storage.from("avatars").createSignedUrl(avatarPath, 3600)).data?.signedUrl ?? null;
    }
    visibleById.set(identity.id, {
      ...identity,
      ...publicProfile,
      photo,
      country_code: publicProfile?.country_code ?? null,
      country: publicProfile?.country ?? null,
      location_label: typeof publicProfile?.location_label === "string" && publicProfile.location_label.trim()
        ? publicProfile.location_label.trim()
        : typeof publicProfile?.country === "string" && publicProfile.country.trim()
          ? publicProfile.country.trim()
          : null,
    });
  }));

  const filterHref = (status: string) => {
    const query = new URLSearchParams();
    if (status !== "all") query.set("status", status);
    if (activeSort !== "newest") query.set("sort", activeSort);
    const value = query.toString();
    return value ? `/app/introductions?${value}` : "/app/introductions";
  };

  return (
    <main lang={locale} className="mx-auto min-h-full w-full max-w-[1580px] bg-[#f7f5ef] px-6 py-10 text-primary sm:px-8 sm:py-12 lg:px-10 lg:py-14 xl:px-12 2xl:px-16">
      <header>
        <p className="eyebrow">{t("app.introductions.eyebrow")}</p>
        <h1 className="page-title-display mt-4">{t("app.introductions.title")}</h1>
        <p className="mt-5 max-w-2xl text-lg leading-7 text-black/60 sm:text-xl">{t("app.introductions.intro")}</p>
      </header>
      {errorMessage && <p role="alert" className="notice notice-error mt-6">{errorMessage}</p>}
      {introductionsError && <p role="alert" className="notice notice-error mt-6">{t("app.introductions.loadError")}</p>}
      {first(params.reported) === "1" && <p role="status" className="notice notice-success mt-4">{t("app.introductions.reported")}</p>}

      <section aria-label={t("app.introductions.how")} className="mt-10 grid gap-0 rounded-[22px] border border-[#eeebe3] bg-[#fbfaf7]/80 px-5 py-2 shadow-sm md:grid-cols-4 md:px-3 md:py-5">
        <div className="flex items-start gap-4 border-b border-black/[0.08] px-2 py-4 md:border-b-0 md:border-r md:px-5 md:py-1"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#e0e6dd] bg-[#fffdfa] text-brand"><IntroIcon name="sprout" /></span><div><p className="text-sm font-semibold text-primary">{t("app.introductions.wroteFirst")}</p><p className="section-description mt-1">{t("app.introductions.wroteFirstBody")}</p></div></div>
        <div className="flex items-start gap-4 border-b border-black/[0.08] px-2 py-4 md:border-b-0 md:border-r md:px-5 md:py-1"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#e8e2d6] bg-[#fffdfa] text-brand"><IntroIcon name="book" /></span><div><p className="text-sm font-semibold text-primary">{t("app.introductions.pace")}</p><p className="section-description mt-1">{t("app.introductions.paceBody")}</p></div></div>
        <div className="flex items-start gap-4 border-b border-black/[0.08] px-2 py-4 md:border-b-0 md:border-r md:px-5 md:py-1"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#e0e6dd] bg-[#fffdfa] text-brand"><IntroIcon name="send" /></span><div><p className="text-sm font-semibold text-primary">{t("app.introductions.start")}</p><p className="section-description mt-1">{t("app.introductions.startBody")}</p></div></div>
        <div className="flex items-start gap-4 px-2 py-4 md:px-5 md:py-1"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#e8e2d6] bg-[#fffdfa] text-brand"><IntroIcon name="shield" /></span><div><p className="text-sm font-semibold text-primary">{t("app.introductions.control")}</p><p className="section-description mt-1">{t("app.introductions.controlBody")}</p></div></div>
      </section>

      <div className="mt-8 flex flex-col gap-4 border-y border-black/10 py-4 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label={t("app.introductions.filters")} className="flex flex-wrap items-center gap-2 sm:gap-5">
          <Link href={filterHref("all")} aria-current={activeStatus === "all" ? "page" : undefined} className={`rounded-full px-4 py-2 text-sm font-semibold transition ${activeStatus === "all" ? "bg-[#fffdfa] text-brand shadow-sm ring-1 ring-black/[0.06]" : "text-black/55 hover:text-brand"}`}>{t("app.introductions.all")} ({allRows.length})</Link>
          <Link href={filterHref("pending")} aria-current={activeStatus === "pending" ? "page" : undefined} className={`rounded-full px-4 py-2 text-sm transition ${activeStatus === "pending" ? "bg-[#fffdfa] font-semibold text-brand shadow-sm ring-1 ring-black/[0.06]" : "text-black/55 hover:text-brand"}`}>{t("app.introductions.pending")} ({pendingCount})</Link>
          <Link href={filterHref("replied")} aria-current={activeStatus === "replied" ? "page" : undefined} className={`rounded-full px-4 py-2 text-sm transition ${activeStatus === "replied" ? "bg-[#fffdfa] font-semibold text-brand shadow-sm ring-1 ring-black/[0.06]" : "text-black/55 hover:text-brand"}`}>{t("app.introductions.replied")} ({repliedCount})</Link>
        </nav>
        <IntroductionSort activeSort={activeSort} activeStatus={activeStatus} />
      </div>

      <section aria-label={t("app.introductions.list")} className="mt-6 space-y-5">
        {visibleRows.map((row: any) => {
          const pendingIntro = row.status === "pending";
          const pending = row.recipient_id === uid && pendingIntro;
          const replied = row.status === "replied";
          const personId = row.sender_id === uid ? row.recipient_id : row.sender_id;
          const person = visibleById.get(personId);
          const displayName = person?.display_name || person?.username || (row.recipient_id === uid ? "New introduction" : "Introduction sent");
          const ageLabel = typeof person?.age === "number" ? `, ${person.age}` : "";
          const countryName = countryNameForCode(person?.country_code) ?? person?.country ?? null;
          return (
            <article key={row.id} className="grid overflow-hidden rounded-xl border border-[#e5e0d6] bg-[#fffdfa] shadow-[0_3px_14px_rgba(36,57,45,0.04)] lg:grid-cols-[minmax(0,1fr)_300px]">
              <div className="min-w-0 p-5 sm:p-7">
                <div className="flex min-w-0 items-start gap-5">
                  <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full border border-[#ded8cc] bg-[#e8ece4] sm:h-32 sm:w-32">
                    {person?.photo ? <Image src={person.photo} alt={`${displayName} profile photo`} fill sizes="128px" unoptimized={isSignedAvatarUrl(person.photo)} className="object-cover" /> : <span role="img" aria-label={`${displayName} profile photo unavailable`} className="flex h-full items-center justify-center font-serif text-4xl text-muted">{displayName.trim().charAt(0).toUpperCase() || "·"}</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-3">
                      <h2 className="min-w-0 font-serif text-[clamp(1.7rem,2.4vw,2.35rem)] leading-tight tracking-[-0.025em] text-primary">
                        {person?.username ? <Link href={`/app/profile/${encodeURIComponent(person.username)}?from=introductions`} className="break-words hover:text-brand hover:underline">{displayName}{ageLabel}</Link> : <span>{displayName}{ageLabel}</span>}
                      </h2>
                      <time className="shrink-0 text-sm text-black/45" dateTime={row.created_at}>{dateLabel(row.created_at)}</time>
                    </div>
                    {person?.location_label && <p className="mt-2 flex items-center gap-2 text-sm text-black/60"><CountryFlag code={person.country_code} countryName={countryName} /><span>{person.location_label}</span></p>}
                    <blockquote className="mt-6 whitespace-pre-wrap font-serif text-[clamp(1.25rem,1.8vw,1.6rem)] leading-8 tracking-[-0.01em] text-brand">“{row.icebreaker}”</blockquote>
                    <div className="mt-5 flex flex-wrap items-center gap-3">
                      <span className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-[.11em] ${pendingIntro ? "bg-[#fae3b8] text-[#93621b]" : replied ? "bg-[#e6f0e7] text-[#276b50]" : "bg-[#eef0ea] text-black/50"}`}><span aria-hidden="true" className="text-sm">{pendingIntro ? "◷" : replied ? "✓" : "·"}</span>{row.status}</span>
                      {replied && <span className="text-sm text-black/50">You replied{row.conversation_id_legacy ? ` on ${dateLabel(row.created_at)}` : ""}</span>}
                    </div>
                  </div>
                </div>
                <details className="mt-7 text-sm">
                  <summary className="cursor-pointer list-none text-black/45 transition hover:text-black/70"><span aria-hidden="true" className="mr-2">▸</span>{t("app.introductions.report")}</summary>
                  <form action={submitReport} className="user-soft-panel mt-4 max-w-lg space-y-3 p-4">
                    <input type="hidden" name="target_type" value="introduction" />
                    <input type="hidden" name="target_id" value={row.id} />
                    <input type="hidden" name="return_to" value="/app/introductions" />
                    <select name="reason" className="field w-full" aria-label={t("app.reports.reason")}><option value="spam">{t("app.reports.spam")}</option><option value="scam/fraud">{t("app.reports.scam")}</option><option value="harassment">{t("app.reports.harassment")}</option><option value="sexual/inappropriate content">{t("app.reports.sexual")}</option><option value="hate/abuse">{t("app.reports.hate")}</option><option value="fake profile/impersonation">{t("app.reports.fake")}</option><option value="underage concern">{t("app.reports.underage")}</option><option value="other">{t("app.reports.other")}</option></select>
                    <textarea name="details" aria-label={t("app.reports.details")} className="field min-h-24 w-full" placeholder={t("app.reports.details")} />
                    {pending && <label className="flex items-center gap-2 text-sm text-black/60"><input type="checkbox" name="decline_pending" /> {t("app.introductions.reportDecline")}</label>}
                    <button className="user-danger-button">{t("app.introductions.report")}</button>
                  </form>
                </details>
              </div>

              <aside className="flex flex-col justify-center border-t border-black/10 bg-[#fcfbf7] p-5 sm:p-7 lg:border-l lg:border-t-0">
                {pending ? <>
                  <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f5f0e7] text-brand"><IntroIcon name="sparkle" /></span><div><p className="font-semibold text-primary">{t("app.introductions.firstImpression")}</p><p className="section-description mt-1">{t("app.introductions.curious")}</p></div></div>
                  <details className="mt-7">
                    <summary className="btn-primary flex min-h-11 cursor-pointer list-none items-center justify-center rounded-md px-4 py-2.5 text-center text-sm font-medium">{t("app.introductions.open")}</summary>
                    <form action={replyToIntroduction} className="mt-3 space-y-2">
                      <input type="hidden" name="introduction_id" value={row.id} />
                      <label htmlFor={`reply-${row.id}`} className="sr-only">{t("app.introductions.reply")}</label>
                      <textarea id={`reply-${row.id}`} name="reply" required className="field min-h-24 w-full text-sm" placeholder={t("app.introductions.replyPlaceholder")} />
                      <button className="btn-primary w-full px-4 py-2.5 text-sm">{t("app.introductions.reply")}</button>
                    </form>
                  </details>
                  <form action={declineIntroduction} className="mt-3"><input type="hidden" name="introduction_id" value={row.id} /><button className="w-full px-4 py-2 text-sm text-black/55 hover:text-black/75">{t("app.introductions.notInterested")}</button></form>
                </> : pendingIntro ? <>
                  <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f5f0e7] text-brand"><IntroIcon name="clock" /></span><div><p className="font-semibold text-primary">{t("app.introductions.waiting")}</p><p className="section-description mt-1">{t("app.introductions.waitingBody")}</p></div></div>
                </> : replied && row.conversation_id_legacy ? <>
                  <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#e8f0e8] text-brand"><IntroIcon name="send" /></span><div><p className="font-semibold text-primary">{t("app.introductions.started")}</p><p className="section-description mt-1">{t("app.introductions.startedBody")}</p></div></div>
                  <Link href={`/app/messages/${encodeURIComponent(row.conversation_id_legacy)}`} className="btn-secondary mt-7 inline-flex min-h-11 items-center justify-center rounded-md px-4 py-2.5 text-sm">{t("app.introductions.openConversation")}</Link>
                  <span className="mt-3 text-center text-sm text-black/45">{t("app.introductions.notInterested")}</span>
                </> : <>
                  <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#eef0ea] text-muted"><IntroIcon name="clock" /></span><div><p className="font-semibold text-primary">{row.status === "expired" ? t("app.introductions.expired") : t("app.introductions.closed")}</p><p className="section-description mt-1">{t("app.introductions.inactive")}</p></div></div>
                </>}
              </aside>
            </article>
          );
        })}
        {!introductionsError && !visibleRows.length && <p className="user-empty-state mt-4 py-14">{activeStatus === "pending" ? t("app.introductions.emptyPending") : activeStatus === "replied" ? t("app.introductions.emptyReplied") : t("app.introductions.empty")}</p>}
      </section>

      <aside className="mt-7 flex flex-col gap-3 rounded-xl border border-[#e5e0d6] bg-[#fbfaf7] px-5 py-4 text-sm text-black/60 sm:flex-row sm:items-center sm:justify-between sm:px-6"><p className="flex items-center gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#d9e5d9] text-brand"><IntroIcon name="sprout" /></span>{t("app.introductions.kindness")}</p></aside>
    </main>
  );
}
