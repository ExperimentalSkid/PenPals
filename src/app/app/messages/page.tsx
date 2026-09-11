/* eslint-disable @typescript-eslint/no-explicit-any */
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createInboxProfileLoader } from "./inbox-profiles";
import { redirect } from "next/navigation";
import { isLostInTransit, lostInTransitCopy } from "@/app/app/messages/snailMailStory";
import { isPrivateAvatarPath } from "@/lib/avatar";
import { getAuthorizedProfilePhoto } from "@/lib/private-avatar-server";
import { getPageI18n } from "@/i18n/server";
import SnailMailJourneyMap from "./SnailMailJourneyMap";

const currentTimestamp = () => Date.now();

type SnailMailInboxLetter = {
  id: string;
  conversationId: string;
  sender_id: string;
  recipient_id: string;
  sent_at: string;
  deliver_at: string;
  delivered_at: string | null;
  recipient_read_at: string | null;
  body_available: boolean;
  unread: boolean;
  letter_status: string;
  transport_mode?: string;
  distance_band?: string;
  story_seed?: number;
  story_variant?: number;
  origin?: string | null;
  destination?: string | null;
  senderName?: string | null;
  senderAge?: number | null;
};

function formatConversationTime(value: string | null | undefined, t: (key: string, values?: Record<string, string | number>) => string) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return t("app.messages.yesterday");
  const days = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (days < 7 && days >= 0) return date.toLocaleDateString(undefined, { weekday: "short" });
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatDeliveryEta(value: string, now: number, t: (key: string, values?: Record<string, string | number>) => string) {
  const remaining = new Date(value).getTime() - now;
  if (!Number.isFinite(remaining) || remaining <= 0) return t("app.messages.delivered");
  const hours = Math.ceil(remaining / 3_600_000);
  if (hours < 24) return t("app.messages.arrivingHours", { count: hours });
  if (hours < 48) return t("app.messages.arrivingTomorrow");
  const days = Math.ceil(hours / 24);
  return t("app.messages.arrivingDays", { count: days });
}

function deliveryMilestone(letter: SnailMailInboxLetter, now: number, t: (key: string) => string) {
  if (isLostInTransit(letter)) return t("app.messages.lost");
  const start = new Date(letter.sent_at).getTime();
  const end = new Date(letter.deliver_at).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return t("app.messages.delivered");
  const progress = Math.max(0, Math.min(100, ((now - start) / (end - start)) * 100));
  if (progress < 18) return t("app.messages.posted");
  if (progress < 42) return t("app.messages.sorting");
  if (progress < 78) return letter.transport_mode === "sea_mail" || letter.distance_band === "long_distance" ? t("app.messages.crossingSea") : t("app.messages.inTransit");
  if (progress < 100) return t("app.messages.outForDelivery");
  return t("app.messages.delivered");
}

function compactJourneyProgress(letter: SnailMailInboxLetter, now: number) {
  const start = Date.parse(letter.sent_at);
  const end = Date.parse(letter.deliver_at);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 100;
  return Math.max(0, Math.min(100, ((now - start) / (end - start)) * 100));
}

type JourneyCheckpoint = { progress: number; label: string; copy: string };

function seededChoice(letter: SnailMailInboxLetter, salt: number, choices: string[]) {
  const seed = Number(letter.story_seed ?? 0) + Number(letter.story_variant ?? 0) * 97 + salt * 131;
  return choices[Math.abs(seed) % choices.length];
}

function journeyCheckpoints(letter: SnailMailInboxLetter, t: (key: string) => string): JourneyCheckpoint[] {
  const crossing = letter.transport_mode === "sea_mail"
    ? seededChoice(letter, 3, [t("app.messages.storySea1"), t("app.messages.storySea2"), t("app.messages.storySea3")])
    : letter.transport_mode === "rail"
      ? seededChoice(letter, 3, [t("app.messages.storyRail1"), t("app.messages.storyRail2"), t("app.messages.storyRail3")])
      : letter.transport_mode === "rare_pigeon"
        ? seededChoice(letter, 3, [t("app.messages.storyPigeon1"), t("app.messages.storyPigeon2"), t("app.messages.storyPigeon3")])
        : letter.distance_band === "long_distance"
          ? seededChoice(letter, 3, [t("app.messages.storyLong1"), t("app.messages.storyLong2"), t("app.messages.storyLong3")])
          : seededChoice(letter, 3, [t("app.messages.storyLocal1"), t("app.messages.storyLocal2"), t("app.messages.storyLocal3")]);

  return [
    { progress: 0, label: t("app.messages.posted"), copy: seededChoice(letter, 0, [t("app.messages.storyPosted1"), t("app.messages.storyPosted2"), t("app.messages.storyPosted3")]) },
    { progress: 18, label: t("app.messages.sorting"), copy: seededChoice(letter, 1, [t("app.messages.storySorting1"), t("app.messages.storySorting2"), t("app.messages.storySorting3")]) },
    { progress: 42, label: t("app.messages.departed"), copy: crossing },
    { progress: 70, label: t("app.messages.inTransit"), copy: seededChoice(letter, 4, [t("app.messages.storyTransit1"), t("app.messages.storyTransit2"), t("app.messages.storyTransit3")]) },
    { progress: 88, label: t("app.messages.nearDestination"), copy: seededChoice(letter, 5, [t("app.messages.storyNear1"), t("app.messages.storyNear2"), t("app.messages.storyNear3")]) },
    { progress: 100, label: t("app.messages.delivered"), copy: t("app.messages.storyDelivered") },
  ];
}

function checkpointTime(letter: SnailMailInboxLetter, checkpointProgress: number) {
  const start = Date.parse(letter.sent_at);
  const end = Date.parse(letter.deliver_at);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return new Date(start + (end - start) * checkpointProgress / 100);
}

function formatCheckpointTime(value: Date | null) {
  if (!value) return "";
  return value.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function SnailMailTrackingStory({ letter, now, t }: { letter: SnailMailInboxLetter; now: number; t: (key: string, values?: Record<string, string | number>) => string }) {
  const value = compactJourneyProgress(letter, now);
  const checkpoints = journeyCheckpoints(letter, t);
  const reached = checkpoints.filter((checkpoint) => checkpoint.progress <= value);
  const next = checkpoints.find((checkpoint) => checkpoint.progress > value);
  const visibleLog = reached.slice(-3).reverse();

  return <div className="mt-4 rounded-xl border border-[#d8d0c2] bg-white/72 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,.8)]">
    <div className="relative pt-1" aria-label={t("app.messages.trackingProgress", { percent: Math.round(value) })}>
      <div className="absolute left-2 right-2 top-[9px] h-px bg-black/15" aria-hidden="true" />
      <div className="absolute left-2 top-[9px] h-px bg-[#073A73]" style={{ width: `calc((100% - 1rem) * ${value / 100})` }} aria-hidden="true" />
      <div className="relative flex justify-between">
        {checkpoints.map((checkpoint) => {
          const active = checkpoint.progress <= value;
          return <div key={checkpoint.progress} className="flex w-4 flex-col items-center">
            <span className={`h-3.5 w-3.5 rounded-full border-2 ${active ? "border-[#073A73] bg-[#073A73]" : "border-[#aaa99f] bg-[#fffdfa]"}`} aria-hidden="true" />
          </div>;
        })}
      </div>
      <div className="mt-2 flex justify-between text-[9px] font-semibold uppercase tracking-[.08em] text-black/40">
        <span>{t("app.messages.posted")}</span><span>{t("app.messages.sorting")}</span><span>{t("app.messages.departed")}</span><span>{t("app.messages.transit")}</span><span>{t("app.messages.near")}</span><span>{t("app.messages.arrived")}</span>
      </div>
    </div>
    <div className="mt-4 border-t border-black/[0.08] pt-3">
      <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-brand">{t("app.messages.journeyLog")}</p>
      <div className="mt-2.5 space-y-2.5">
        {visibleLog.map((checkpoint) => <div key={checkpoint.progress} className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2.5 text-xs leading-5">
          <time className="text-black/40" dateTime={checkpointTime(letter, checkpoint.progress)?.toISOString()}>{formatCheckpointTime(checkpointTime(letter, checkpoint.progress))}</time>
          <p><span className="font-medium text-primary">{checkpoint.label}</span><span className="text-black/55"> · {checkpoint.copy}</span></p>
        </div>)}
        {next && <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2.5 text-xs leading-5">
          <span className="text-black/35">{t("app.messages.nextCheckpoint")}</span>
          <p className="text-black/45"><span className="font-medium text-primary/75">{next.label}</span> · {t("app.messages.expected", { time: formatCheckpointTime(checkpointTime(letter, next.progress)) })}</p>
        </div>}
      </div>
    </div>
  </div>;
}

function Icon({ name }: { name: "messages" | "mail" | "plane" | "arrow" }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[19px] w-[19px] shrink-0" {...common}>
      {name === "messages" && <><path d="M5 18.5 3.5 21l3.9-1.4A9 9 0 1 0 5 18.5Z" /><path d="M8 10.5h8M8 14h5" /></>}
      {name === "mail" && <><rect x="3.5" y="5" width="17" height="14" rx="2" /><path d="m4.5 7 7.5 5 7.5-5" /></>}
      {name === "plane" && <><path d="m4 12 16-7-5.2 14-3.2-6.3L4 12Z" /><path d="m11.6 12.7 4-3.8" /></>}
      {name === "arrow" && <><path d="M5 12h13" /><path d="m13 7 5 5-5 5" /></>}
    </svg>
  );
}

async function enrichLetter(profiles: ReturnType<typeof createInboxProfileLoader>, letter: any, conversationId: string, viewerId: string): Promise<SnailMailInboxLetter> {
  const enriched: SnailMailInboxLetter = { ...letter, conversationId, origin: null, destination: null, senderName: null, senderAge: null };
  if (letter.sender_id === viewerId) {
    enriched.origin = await profiles.origin(viewerId);
    enriched.destination = await profiles.origin(letter.recipient_id);
    return enriched;
  }

  // Resolve only the fields needed for the inbox. Transit letters never render
  // this identity; they use the sender's permitted location as their origin.
  const identity = await profiles.identity(letter.sender_id);
  if (!identity?.username) return enriched;
  enriched.origin = await profiles.origin(letter.sender_id);
  if (letter.body_available || letter.letter_status === "delivered" || letter.delivered_at) {
    enriched.senderName = identity.display_name || identity.username || null;
    enriched.senderAge = typeof identity.age === "number" ? identity.age : null;
  }
  return enriched;
}

export default async function Messages() {
  const { locale, t } = await getPageI18n();
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  const uid = data?.claims?.sub;
  if (!uid) redirect("/sign-in");
  const profiles = createInboxProfileLoader(db, uid);

  const membershipsResult = await db.from("conversation_participants").select("conversation_id,last_read_at,conversations(communication_mode)").eq("user_id", uid);
  const memberships = membershipsResult.data ?? [];
  const instantSummaryResult = await db.rpc("get_instant_message_inbox");
  const instantLoadFailed = Boolean(instantSummaryResult.error);
  const rows = await Promise.all((instantSummaryResult.data ?? []).map(async (row: any) => {
    const other = row.other_user_id ? {
      id: row.other_user_id,
      username: row.other_username,
      display_name: row.other_display_name,
      age: row.other_age,
      avatar_path: row.other_avatar_path,
    } : null;
    const photo = other?.avatar_path && isPrivateAvatarPath(other.avatar_path, other.id)
      ? (await getAuthorizedProfilePhoto(db, other.id, uid)).url
      : null;
    return {
      id: row.conversation_id,
      other,
      photo,
      latest: row.latest_created_at ? { body: row.latest_body, created_at: row.latest_created_at, sender_id: row.latest_sender_id } : null,
      deletedOther: !row.other_user_id,
      unread: Boolean(row.unread),
    };
  }));

  const letterResults = await Promise.all(memberships.map(async (membership: any) => {
    const result = await db.rpc("list_snail_mail", { target_conversation: membership.conversation_id });
    const letters = Array.isArray(result.data) ? result.data : [];
    return {
      error: Boolean(result.error),
      letters: await Promise.all(letters.map((letter: any) => enrichLetter(profiles, letter, membership.conversation_id, uid))),
    };
  }));
  const snailMailLoadFailed = Boolean(membershipsResult.error) || letterResults.some((result) => result.error);
  const messagesLoadFailed = instantLoadFailed || snailMailLoadFailed;
  const now = currentTimestamp();
  const letters = letterResults.flatMap((result) => result.letters);
  const incoming = letters.filter((letter) => letter.sender_id !== uid && !letter.body_available && (letter.letter_status === "incoming" || isLostInTransit(letter))).sort((a, b) => Date.parse(b.sent_at) - Date.parse(a.sent_at));
  const delivered = letters.filter((letter) => letter.sender_id !== uid && !isLostInTransit(letter) && (letter.body_available || letter.letter_status === "delivered" || Boolean(letter.delivered_at))).sort((a, b) => Date.parse(b.sent_at) - Date.parse(a.sent_at));
  const outgoing = letters.filter((letter) => letter.sender_id === uid).sort((a, b) => Date.parse(b.sent_at) - Date.parse(a.sent_at));

  return (
    <main lang={locale} className="min-h-screen w-full bg-[#f7f5ef] px-5 py-8 text-primary sm:px-8 lg:px-10 lg:py-10">
      <div className="mx-auto w-full max-w-[1240px]">
        <header>
          <p className="eyebrow">{t("app.messages.eyebrow")}</p>
          <h1 className="page-title-display mt-3">{t("app.messages.title")}</h1>
          <p className="mt-4 max-w-xl text-[17px] leading-7 text-black/60">{t("app.messages.intro")}</p>
        </header>

        {messagesLoadFailed && <p role="alert" className="notice notice-error mt-7">{t("app.messages.loadError")}</p>}

        <section className="mt-14 overflow-hidden rounded-2xl border border-[#d9d8cf] bg-[#fbfaf6] shadow-[0_18px_50px_rgba(35,57,47,0.07)] lg:grid lg:grid-cols-2">
          <section aria-labelledby="instant-heading" className="min-w-0 bg-[#fbfaf6] px-6 py-8 sm:px-8 lg:border-r lg:border-black/10 lg:px-9 lg:py-10">
            <div className="flex items-center gap-3 text-brand"><Icon name="messages" /><h2 id="instant-heading" className="font-sans text-[11px] font-semibold uppercase tracking-[.19em]">{t("app.messages.instant")}</h2></div>
            <p className="section-description mt-3">{t("app.messages.instantBody")}</p>

            <div className="mt-7 space-y-3">
              {rows.map((r: any) => {
                const name = r.deletedOther ? t("app.messages.deletedUser") : r.other?.display_name ? `${r.other.display_name}${typeof r.other.age === "number" ? `, ${r.other.age}` : ""}` : t("app.messages.conversation");
                const time = formatConversationTime(r.latest?.created_at, t);
                return (
                  <Link key={r.id} href={`/app/messages/${r.id}`} className={`group flex min-w-0 items-center gap-4 rounded-xl border border-black/[0.08] bg-white/62 px-4 py-4 shadow-[0_1px_0_rgba(35,57,47,.03)] transition duration-200 hover:-translate-y-0.5 hover:border-brand/25 hover:bg-white hover:shadow-[0_10px_24px_rgba(35,57,47,.07)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/35 ${r.unread ? "" : "text-black/60"}`}>
                    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-[#e5e9df]" aria-hidden="true">
                      {r.photo ? <Image src={r.photo} alt="" fill sizes="56px" unoptimized className="object-cover" /> : <span className="flex h-full w-full items-center justify-center font-serif text-2xl text-muted">{r.deletedOther ? "·" : (r.other?.display_name?.trim().charAt(0).toUpperCase() || "·")}</span>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-4">
                        <p className={`truncate text-[16px] text-primary group-hover:text-brand ${r.unread ? "font-semibold" : "font-medium"}`}>{name}</p>
                        {time && <time className="shrink-0 text-xs text-black/45" dateTime={r.latest?.created_at}>{time}</time>}
                      </div>
                      <p className="mt-1 line-clamp-2 text-[15px] leading-6 text-black/55">{r.latest?.body ?? t("app.messages.noMessagesYet")}</p>
                    </div>
                    {r.unread && <span className="flex h-2.5 w-2.5 shrink-0 items-center justify-center rounded-full bg-[#16745a]" aria-hidden="true"><span className="sr-only">{t("app.messages.unread")}</span></span>}
                  </Link>
                );
              })}
              {!instantLoadFailed && !rows.length && <p className="user-empty-state py-12">{t("app.messages.empty")}</p>}
            </div>
          </section>

          <section aria-labelledby="snail-mail-heading" className="relative min-w-0 border-t border-black/10 bg-[linear-gradient(145deg,#f5f1e7_0%,#f8f5ed_48%,#f1f3ed_100%)] px-6 py-8 sm:px-8 lg:border-t-0 lg:px-9 lg:py-10">
            <div className="flex items-center gap-3 text-brand"><Icon name="mail" /><h2 id="snail-mail-heading" className="font-sans text-[11px] font-semibold uppercase tracking-[.19em]">{t("app.messages.snail")}</h2></div>
            <p className="section-description mt-3">{t("app.messages.snailBody")}</p>

            <section aria-labelledby="incoming-mail-heading" className="mt-8 rounded-2xl border border-[#ded6c7] bg-white/58 p-5 shadow-[0_8px_28px_rgba(74,63,43,.045)] sm:p-6">
              <div className="flex items-center gap-3 text-brand"><Icon name="plane" /><h3 id="incoming-mail-heading" className="text-[11px] font-semibold uppercase tracking-[.19em]">{t("app.messages.incoming")}</h3></div>
              <p className="section-description mt-2">{t("app.messages.incomingBody")}</p>
              <div className="mt-5 space-y-3">
                {incoming.map((letter) => (
                  <Link key={letter.id} href={`/app/messages/${letter.conversationId}`} className="group block rounded-xl border border-[#dfd4c2] border-l-4 border-l-[#b88b67] bg-[#fffdf8] px-5 py-5 shadow-[0_3px_14px_rgba(92,70,44,.045)] transition duration-200 hover:-translate-y-0.5 hover:border-brand/30 hover:bg-white hover:shadow-[0_10px_24px_rgba(74,63,43,.07)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/35">
                    <div className="flex items-start gap-4">
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#ece9df] text-muted"><Icon name="mail" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs text-black/45">{t("app.messages.incomingLetter")}</span>
                        <span className="mt-1 block truncate font-serif text-[22px] text-primary">{letter.origin || t("app.messages.unknownOrigin")}</span>
                        <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-brand">{isLostInTransit(letter) ? <><span className="inline-flex items-center gap-1.5 rounded-full bg-[#f0e9e2] px-2.5 py-1"><Icon name="mail" />{t("app.messages.lost")}</span><span className="text-black/55">{lostInTransitCopy(letter, t)}</span></> : <><span className="inline-flex items-center gap-1.5 rounded-full bg-[#e8eee8] px-2.5 py-1"><Icon name="plane" />{formatDeliveryEta(letter.deliver_at, now, t)}</span><span className="text-black/40">{deliveryMilestone(letter, now, t)}</span></>}</span>
                      </span>
                    </div>
                  </Link>
                ))}
                {!snailMailLoadFailed && !incoming.length && <p className="user-empty-state py-6">{t("app.messages.noIncoming")}</p>}
              </div>
            </section>

            <section aria-labelledby="delivered-mail-heading" className="mt-5 rounded-2xl border border-[#d8ddd4] bg-[#f8faf6]/78 p-5 shadow-[0_8px_28px_rgba(35,57,47,.04)] sm:p-6">
              <div className="flex items-center gap-3 text-brand"><Icon name="mail" /><h3 id="delivered-mail-heading" className="text-[11px] font-semibold uppercase tracking-[.19em]">{t("app.messages.delivered")}</h3></div>
              <p className="section-description mt-2">{t("app.messages.deliveredBody")}</p>
              <div className="mt-5 space-y-3">
                {delivered.map((letter) => <Link key={letter.id} href={`/app/messages/${letter.conversationId}`} className="group flex items-center gap-4 rounded-xl border border-[#dfe2da] bg-white/72 px-4 py-4 shadow-[0_2px_10px_rgba(35,57,47,.035)] transition duration-200 hover:-translate-y-0.5 hover:border-brand/25 hover:bg-white hover:shadow-[0_9px_22px_rgba(35,57,47,.065)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/35"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#e8eee8] text-muted"><Icon name="mail" /></span><span className="min-w-0 flex-1"><span className="block text-xs text-black/45">{t("app.messages.from")}</span><span className="mt-0.5 block truncate font-serif text-[20px] text-primary">{letter.senderName || t("app.messages.aPenPal")}{typeof letter.senderAge === "number" ? `, ${letter.senderAge}` : ""}</span><span className="mt-1 block text-xs text-black/50">{t("app.messages.received", { time: formatConversationTime(letter.delivered_at || letter.deliver_at, t) || t("app.messages.recently") })}</span></span><Icon name="arrow" /></Link>)}
                {!snailMailLoadFailed && !delivered.length && <p className="user-empty-state py-6">{t("app.messages.deliveredEmpty")}</p>}
              </div>
            </section>

            {outgoing.length > 0 && <section aria-labelledby="sent-mail-heading" className="mt-5 rounded-2xl border border-[#d4c8b5] bg-[#fffaf0]/82 p-5 shadow-[0_14px_36px_rgba(92,70,44,.075)] sm:p-6"><div className="flex items-center gap-3 text-brand"><Icon name="mail" /><h3 id="sent-mail-heading" className="text-[11px] font-semibold uppercase tracking-[.19em]">{t("app.messages.sent")}</h3></div><p className="section-description mt-2">{t("app.messages.sentBody")}</p><div className="mt-5 space-y-4">{outgoing.slice(0, 3).map((letter) => <Link key={letter.id} href={`/app/messages/${letter.conversationId}`} className="block rounded-2xl border border-[#d9cdbb] bg-[#fffdf8] p-4 text-sm shadow-[0_5px_18px_rgba(92,70,44,.055)] transition duration-200 hover:-translate-y-0.5 hover:border-brand/30 hover:bg-white hover:shadow-[0_14px_30px_rgba(74,63,43,.09)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/35 sm:p-5"><div className="flex items-center justify-between gap-4">{isLostInTransit(letter) ? <span className="min-w-0"><span className="block">{t("app.messages.lost")}</span><span className="mt-0.5 block truncate text-xs text-black/45">{lostInTransitCopy(letter, t)}</span></span> : <span>{formatDeliveryEta(letter.deliver_at, now, t)}</span>}<span className="shrink-0 text-xs text-black/45">{deliveryMilestone(letter, now, t)}</span></div>{!isLostInTransit(letter) && compactJourneyProgress(letter, now) < 100 ? <><SnailMailTrackingStory letter={letter} now={now} t={t} /><SnailMailJourneyMap origin={letter.origin ?? null} destination={letter.destination ?? null} progress={compactJourneyProgress(letter, now)} compact /></> : null}</Link>)}</div></section>}
          </section>
        </section>
      </div>
    </main>
  );
}
