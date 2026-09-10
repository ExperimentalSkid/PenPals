/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createInboxProfileLoader } from "./inbox-profiles";
import { redirect } from "next/navigation";
import { isLostInTransit, lostInTransitCopy } from "@/app/app/messages/snailMailStory";
import { isPrivateAvatarPath } from "@/lib/avatar";
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

function formatConversationTime(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  const days = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (days < 7 && days >= 0) return date.toLocaleDateString(undefined, { weekday: "short" });
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatDeliveryEta(value: string, now: number) {
  const remaining = new Date(value).getTime() - now;
  if (!Number.isFinite(remaining) || remaining <= 0) return "Delivered";
  const hours = Math.ceil(remaining / 3_600_000);
  if (hours < 24) return `Arriving in ${hours} ${hours === 1 ? "hour" : "hours"}`;
  if (hours < 48) return "Arriving tomorrow";
  const days = Math.ceil(hours / 24);
  return `Arriving in ${days} days`;
}

function deliveryMilestone(letter: SnailMailInboxLetter, now: number) {
  if (isLostInTransit(letter)) return "Lost in transit";
  const start = new Date(letter.sent_at).getTime();
  const end = new Date(letter.deliver_at).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return "Delivered";
  const progress = Math.max(0, Math.min(100, ((now - start) / (end - start)) * 100));
  if (progress < 18) return "Posted";
  if (progress < 42) return "Sorting";
  if (progress < 78) return letter.transport_mode === "sea_mail" || letter.distance_band === "long_distance" ? "Crossing the sea" : "In transit";
  if (progress < 100) return "Out for delivery";
  return "Delivered";
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

function journeyCheckpoints(letter: SnailMailInboxLetter): JourneyCheckpoint[] {
  const crossing = letter.transport_mode === "sea_mail"
    ? seededChoice(letter, 3, ["The envelope has sea legs now.", "The captain confirms the letter is not allowed to steer.", "Still dry. Mostly."])
    : letter.transport_mode === "rail"
      ? seededChoice(letter, 3, ["Changed trains without missing the connection.", "Rail transfer complete. Better punctuality than expected.", "The letter has found the correct platform."])
      : letter.transport_mode === "rare_pigeon"
        ? seededChoice(letter, 3, ["The pigeon remains suspiciously confident.", "Wing-powered logistics are proceeding to plan.", "The courier stopped for crumbs, then resumed duty."])
        : letter.distance_band === "long_distance"
          ? seededChoice(letter, 3, ["International transit accepted it without an argument.", "The letter has crossed into the long-haul part of the journey.", "Somewhere between time zones, still heading the right way."])
          : seededChoice(letter, 3, ["It has left the local network and is moving on.", "Transfer complete. The envelope appears to know the route.", "Onward it goes, with unreasonable confidence for a piece of paper."]);

  return [
    { progress: 0, label: "Posted", copy: seededChoice(letter, 0, ["Letter accepted. No questions asked.", "Stamped, sealed, and officially somebody else’s problem.", "The journey begins with excellent envelope posture."]) },
    { progress: 18, label: "Sorting", copy: seededChoice(letter, 1, ["Sorting complete. It appears to know where it’s going.", "It survived the sorting room with its dignity intact.", "Correct pile, correct direction. Promising start."]) },
    { progress: 42, label: "Departed", copy: crossing },
    { progress: 70, label: "In transit", copy: seededChoice(letter, 4, ["Still travelling. No dramatic incidents to report.", "Steady progress. The envelope refuses to discuss mileage.", "The route continues. Morale remains inexplicably high."]) },
    { progress: 88, label: "Near destination", copy: seededChoice(letter, 5, ["Almost there. The letter is rehearsing its entrance.", "Final stretch. It can practically see the mailbox.", "Near destination and trying not to look too excited."]) },
    { progress: 100, label: "Delivered", copy: "Journey complete. The letter has arrived." },
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

function SnailMailTrackingStory({ letter, now }: { letter: SnailMailInboxLetter; now: number }) {
  const value = compactJourneyProgress(letter, now);
  const checkpoints = journeyCheckpoints(letter);
  const reached = checkpoints.filter((checkpoint) => checkpoint.progress <= value);
  const next = checkpoints.find((checkpoint) => checkpoint.progress > value);
  const visibleLog = reached.slice(-3).reverse();

  return <div className="mt-4 rounded-xl border border-[#d8d0c2] bg-white/72 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,.8)]">
    <div className="relative pt-1" aria-label={`Letter tracking progress ${Math.round(value)} percent`}>
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
        <span>Posted</span><span>Sorting</span><span>Departed</span><span>Transit</span><span>Near</span><span>Arrived</span>
      </div>
    </div>
    <div className="mt-4 border-t border-black/[0.08] pt-3">
      <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-brand">Journey log</p>
      <div className="mt-2.5 space-y-2.5">
        {visibleLog.map((checkpoint) => <div key={checkpoint.progress} className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2.5 text-xs leading-5">
          <time className="text-black/40" dateTime={checkpointTime(letter, checkpoint.progress)?.toISOString()}>{formatCheckpointTime(checkpointTime(letter, checkpoint.progress))}</time>
          <p><span className="font-medium text-primary">{checkpoint.label}</span><span className="text-black/55"> · {checkpoint.copy}</span></p>
        </div>)}
        {next && <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2.5 text-xs leading-5">
          <span className="text-black/35">Next</span>
          <p className="text-black/45"><span className="font-medium text-primary/75">{next.label}</span> · Expected {formatCheckpointTime(checkpointTime(letter, next.progress))}</p>
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
    enriched.senderName = identity.display_name || identity.username || "A pen pal";
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

  const memberships = (await db.from("conversation_participants").select("conversation_id,last_read_at,conversations(communication_mode)").eq("user_id", uid)).data ?? [];
  const instantSummaryResult = await db.rpc("get_instant_message_inbox");
  const rows = await Promise.all((instantSummaryResult.data ?? []).map(async (row: any) => {
    const other = row.other_user_id ? {
      id: row.other_user_id,
      username: row.other_username,
      display_name: row.other_display_name,
      age: row.other_age,
      avatar_path: row.other_avatar_path,
    } : null;
    const photo = other?.avatar_path && isPrivateAvatarPath(other.avatar_path, other.id)
      ? (await db.storage.from("avatars").createSignedUrl(other.avatar_path, 3600)).data?.signedUrl ?? null
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
    return Promise.all(letters.map((letter: any) => enrichLetter(profiles, letter, membership.conversation_id, uid)));
  }));
  const now = currentTimestamp();
  const letters = letterResults.flat();
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

        <section className="mt-14 overflow-hidden rounded-2xl border border-[#d9d8cf] bg-[#fbfaf6] shadow-[0_18px_50px_rgba(35,57,47,0.07)] lg:grid lg:grid-cols-2">
          <section aria-labelledby="instant-heading" className="min-w-0 bg-[#fbfaf6] px-6 py-8 sm:px-8 lg:border-r lg:border-black/10 lg:px-9 lg:py-10">
            <div className="flex items-center gap-3 text-brand"><Icon name="messages" /><h2 id="instant-heading" className="font-sans text-[11px] font-semibold uppercase tracking-[.19em]">{t("app.messages.instant")}</h2></div>
            <p className="section-description mt-3">{t("app.messages.instantBody")}</p>

            <div className="mt-7 space-y-3">
              {rows.map((r: any) => {
                const name = r.deletedOther ? "Deleted user" : r.other?.display_name ? `${r.other.display_name}${typeof r.other.age === "number" ? `, ${r.other.age}` : ""}` : "Conversation";
                const time = formatConversationTime(r.latest?.created_at);
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
                      <p className="mt-1 line-clamp-2 text-[15px] leading-6 text-black/55">{r.latest?.body ?? "No messages yet"}</p>
                    </div>
                    {r.unread && <span className="flex h-2.5 w-2.5 shrink-0 items-center justify-center rounded-full bg-[#16745a]" aria-hidden="true"><span className="sr-only">{t("app.messages.unread")}</span></span>}
                  </Link>
                );
              })}
              {!rows.length && <p className="rounded-xl border border-dashed border-black/15 bg-white/40 px-5 py-12 text-center text-sm leading-6 text-black/50">{t("app.messages.empty")}</p>}
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
                        <span className="mt-1 block truncate font-serif text-[22px] text-primary">{letter.origin || "A letter is travelling to you"}</span>
                        <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-brand">{isLostInTransit(letter) ? <><span className="inline-flex items-center gap-1.5 rounded-full bg-[#f0e9e2] px-2.5 py-1"><Icon name="mail" />{t("app.messages.lost")}</span><span className="text-black/55">{lostInTransitCopy(letter)}</span></> : <><span className="inline-flex items-center gap-1.5 rounded-full bg-[#e8eee8] px-2.5 py-1"><Icon name="plane" />{formatDeliveryEta(letter.deliver_at, now)}</span><span className="text-black/40">{deliveryMilestone(letter, now)}</span></>}</span>
                      </span>
                    </div>
                  </Link>
                ))}
                {!incoming.length && <p className="rounded-lg border border-dashed border-black/15 px-5 py-6 text-sm leading-6 text-black/50">{t("app.messages.noIncoming")}</p>}
              </div>
            </section>

            <section aria-labelledby="delivered-mail-heading" className="mt-5 rounded-2xl border border-[#d8ddd4] bg-[#f8faf6]/78 p-5 shadow-[0_8px_28px_rgba(35,57,47,.04)] sm:p-6">
              <div className="flex items-center gap-3 text-brand"><Icon name="mail" /><h3 id="delivered-mail-heading" className="text-[11px] font-semibold uppercase tracking-[.19em]">{t("app.messages.delivered")}</h3></div>
              <p className="section-description mt-2">{t("app.messages.deliveredBody")}</p>
              <div className="mt-5 space-y-3">
                {delivered.map((letter) => <Link key={letter.id} href={`/app/messages/${letter.conversationId}`} className="group flex items-center gap-4 rounded-xl border border-[#dfe2da] bg-white/72 px-4 py-4 shadow-[0_2px_10px_rgba(35,57,47,.035)] transition duration-200 hover:-translate-y-0.5 hover:border-brand/25 hover:bg-white hover:shadow-[0_9px_22px_rgba(35,57,47,.065)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/35"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#e8eee8] text-muted"><Icon name="mail" /></span><span className="min-w-0 flex-1"><span className="block text-xs text-black/45">{t("app.messages.from")}</span><span className="mt-0.5 block truncate font-serif text-[20px] text-primary">{letter.senderName || "A pen pal"}{typeof letter.senderAge === "number" ? `, ${letter.senderAge}` : ""}</span><span className="mt-1 block text-xs text-black/50">Received {formatConversationTime(letter.delivered_at || letter.deliver_at) || "recently"}</span></span><Icon name="arrow" /></Link>)}
                {!delivered.length && <p className="rounded-lg border border-dashed border-black/15 px-5 py-6 text-sm leading-6 text-black/50">{t("app.messages.deliveredEmpty")}</p>}
              </div>
            </section>

            {outgoing.length > 0 && <section aria-labelledby="sent-mail-heading" className="mt-5 rounded-2xl border border-[#d4c8b5] bg-[#fffaf0]/82 p-5 shadow-[0_14px_36px_rgba(92,70,44,.075)] sm:p-6"><div className="flex items-center gap-3 text-brand"><Icon name="mail" /><h3 id="sent-mail-heading" className="text-[11px] font-semibold uppercase tracking-[.19em]">{t("app.messages.sent")}</h3></div><p className="section-description mt-2">{t("app.messages.sentBody")}</p><div className="mt-5 space-y-4">{outgoing.slice(0, 3).map((letter) => <Link key={letter.id} href={`/app/messages/${letter.conversationId}`} className="block rounded-2xl border border-[#d9cdbb] bg-[#fffdf8] p-4 text-sm shadow-[0_5px_18px_rgba(92,70,44,.055)] transition duration-200 hover:-translate-y-0.5 hover:border-brand/30 hover:bg-white hover:shadow-[0_14px_30px_rgba(74,63,43,.09)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/35 sm:p-5"><div className="flex items-center justify-between gap-4">{isLostInTransit(letter) ? <span className="min-w-0"><span className="block">{t("app.messages.lost")}</span><span className="mt-0.5 block truncate text-xs text-black/45">{lostInTransitCopy(letter)}</span></span> : <span>{formatDeliveryEta(letter.deliver_at, now)}</span>}<span className="shrink-0 text-xs text-black/45">{deliveryMilestone(letter, now)}</span></div>{!isLostInTransit(letter) && compactJourneyProgress(letter, now) < 100 ? <><SnailMailTrackingStory letter={letter} now={now} /><SnailMailJourneyMap origin={letter.origin ?? null} destination={letter.destination ?? null} progress={compactJourneyProgress(letter, now)} compact /></> : null}</Link>)}</div></section>}
          </section>
        </section>
      </div>
    </main>
  );
}
