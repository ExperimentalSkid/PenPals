/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createInboxProfileLoader } from "./inbox-profiles";
import { redirect } from "next/navigation";
import { isLostInTransit, lostInTransitCopy } from "@/app/app/messages/snailMailStory";

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
  origin?: string | null;
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
  const enriched: SnailMailInboxLetter = { ...letter, conversationId, origin: null, senderName: null, senderAge: null };
  if (letter.sender_id === viewerId) return enriched;

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
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  const uid = data?.claims?.sub;
  if (!uid) redirect("/sign-in");
  const profiles = createInboxProfileLoader(db, uid);

  const memberships = (await db.from("conversation_participants").select("conversation_id,last_read_at,conversations(communication_mode)").eq("user_id", uid)).data ?? [];
  const instantMemberships = memberships.filter((membership: any) => {
    const conversation = Array.isArray(membership.conversations) ? membership.conversations[0] : membership.conversations;
    return conversation?.communication_mode !== "snail_mail";
  });
  const rows = await Promise.all(instantMemberships.map(async (m: any) => {
    const [participantResult, latestResult] = await Promise.all([
      db.from("conversation_participants").select("user_id").eq("conversation_id", m.conversation_id).neq("user_id", uid).limit(1),
      db.from("messages").select("body,created_at,sender_id").eq("conversation_id", m.conversation_id).order("created_at", { ascending: false }).limit(1),
    ]);
    const participant = participantResult.data?.[0];
    const other = participant ? await profiles.identity(participant.user_id) : null;
    const photo = participant ? await profiles.photo(participant.user_id) : null;
    const latest = latestResult.data?.[0];
    return {
      id: m.conversation_id,
      other,
      photo,
      latest,
      deletedOther: !participant,
      unread: Boolean(latest && latest.sender_id && latest.sender_id !== uid && (!m.last_read_at || new Date(latest.created_at) > new Date(m.last_read_at))),
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
    <main className="min-h-screen w-full bg-[#f7f5ef] px-5 py-8 text-[#16251f] sm:px-8 lg:px-10 lg:py-10">
      <div className="mx-auto w-full max-w-[1240px]">
        <header>
          <p className="text-[11px] font-semibold uppercase tracking-[.22em] text-[#087456]">Your conversations</p>
          <h1 className="mt-3 font-serif text-[clamp(2.9rem,4.2vw,3.75rem)] leading-none tracking-[-0.04em] text-[#10231d]">Messages</h1>
          <p className="mt-4 max-w-xl text-[17px] leading-7 text-black/60">Your conversations in one place.</p>
        </header>

        <section className="mt-14 overflow-hidden rounded-xl border border-[#deded5] bg-[#fbfaf6] shadow-[0_1px_0_rgba(35,57,47,0.03)] lg:grid lg:grid-cols-2">
          <section aria-labelledby="instant-heading" className="min-w-0 px-6 py-8 sm:px-8 lg:border-r lg:border-black/10 lg:px-9 lg:py-9">
            <div className="flex items-center gap-3 text-[#075d46]"><Icon name="messages" /><h2 id="instant-heading" className="font-sans text-[11px] font-semibold uppercase tracking-[.19em]">Instant messages</h2></div>
            <p className="mt-3 text-sm leading-6 text-black/55">Your current conversations.</p>

            <div className="mt-7 divide-y divide-black/[0.09] border-y border-black/[0.09]">
              {rows.map((r: any) => {
                const name = r.deletedOther ? "Deleted user" : r.other?.display_name ? `${r.other.display_name}${typeof r.other.age === "number" ? `, ${r.other.age}` : ""}` : "Conversation";
                const time = formatConversationTime(r.latest?.created_at);
                return (
                  <Link key={r.id} href={`/app/messages/${r.id}`} className={`group flex min-w-0 items-center gap-4 py-5 transition-colors hover:bg-[#f3f4ed]/70 ${r.unread ? "" : "text-black/60"}`}>
                    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-[#e5e9df]" aria-hidden="true">
                      {r.photo ? <Image src={r.photo} alt="" fill sizes="56px" unoptimized className="object-cover" /> : <span className="flex h-full w-full items-center justify-center font-serif text-2xl text-[#557264]">{r.deletedOther ? "·" : (r.other?.display_name?.trim().charAt(0).toUpperCase() || "·")}</span>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-4">
                        <p className={`truncate text-[16px] text-[#10231d] group-hover:text-[#075d46] ${r.unread ? "font-semibold" : "font-medium"}`}>{name}</p>
                        {time && <time className="shrink-0 text-xs text-black/45" dateTime={r.latest?.created_at}>{time}</time>}
                      </div>
                      <p className="mt-1 line-clamp-2 text-[15px] leading-6 text-black/55">{r.latest?.body ?? "No messages yet"}</p>
                    </div>
                    {r.unread && <span className="flex h-2.5 w-2.5 shrink-0 items-center justify-center rounded-full bg-[#16745a]" aria-hidden="true"><span className="sr-only">Unread conversation</span></span>}
                  </Link>
                );
              })}
              {!rows.length && <p className="py-12 text-sm leading-6 text-black/50">No conversations yet. Your first exchange will appear here.</p>}
            </div>
          </section>

          <section aria-labelledby="snail-mail-heading" className="min-w-0 border-t border-black/10 px-6 py-8 sm:px-8 lg:border-t-0 lg:px-9 lg:py-9">
            <div className="flex items-center gap-3 text-[#075d46]"><Icon name="mail" /><h2 id="snail-mail-heading" className="font-sans text-[11px] font-semibold uppercase tracking-[.19em]">Snail Mail</h2></div>
            <p className="mt-3 text-sm leading-6 text-black/55">Digital letters that arrive over time.</p>

            <section aria-labelledby="incoming-mail-heading" className="mt-8">
              <div className="flex items-center gap-3 text-[#075d46]"><Icon name="plane" /><h3 id="incoming-mail-heading" className="text-[11px] font-semibold uppercase tracking-[.19em]">Incoming</h3></div>
              <p className="mt-2 text-sm leading-6 text-black/55">Letters on their way. You&apos;ll see the sender when they arrive.</p>
              <div className="mt-5 space-y-3">
                {incoming.map((letter) => (
                  <Link key={letter.id} href={`/app/messages/${letter.conversationId}`} className="group block rounded-lg border border-[#e3ddd2] border-l-4 border-l-[#c89f7f] bg-[#fffdfa] px-5 py-5 transition hover:border-[#087456]/45 hover:bg-white">
                    <div className="flex items-start gap-4">
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#ece9df] text-[#4d675a]"><Icon name="mail" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs text-black/45">Incoming letter</span>
                        <span className="mt-1 block truncate font-serif text-[22px] text-[#10231d]">{letter.origin || "A letter is travelling to you"}</span>
                        <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#075d46]">{isLostInTransit(letter) ? <><span className="inline-flex items-center gap-1.5 rounded-full bg-[#f0e9e2] px-2.5 py-1"><Icon name="mail" />Lost in transit</span><span className="text-black/55">{lostInTransitCopy(letter)}</span></> : <><span className="inline-flex items-center gap-1.5 rounded-full bg-[#e8eee8] px-2.5 py-1"><Icon name="plane" />{formatDeliveryEta(letter.deliver_at, now)}</span><span className="text-black/40">{deliveryMilestone(letter, now)}</span></>}</span>
                      </span>
                    </div>
                  </Link>
                ))}
                {!incoming.length && <p className="rounded-lg border border-dashed border-black/15 px-5 py-6 text-sm leading-6 text-black/50">No letters are travelling your way right now.</p>}
              </div>
            </section>

            <section aria-labelledby="delivered-mail-heading" className="mt-9 border-t border-black/10 pt-7">
              <div className="flex items-center gap-3 text-[#075d46]"><Icon name="mail" /><h3 id="delivered-mail-heading" className="text-[11px] font-semibold uppercase tracking-[.19em]">Delivered</h3></div>
              <p className="mt-2 text-sm leading-6 text-black/55">Letters that have arrived.</p>
              <div className="mt-5 space-y-3">
                {delivered.map((letter) => <Link key={letter.id} href={`/app/messages/${letter.conversationId}`} className="group flex items-center gap-4 rounded-lg border border-[#e3ddd2] bg-[#fffdfa] px-4 py-4 transition hover:border-[#087456]/45 hover:bg-white"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#e8eee8] text-[#4d675a]"><Icon name="mail" /></span><span className="min-w-0 flex-1"><span className="block text-xs text-black/45">From</span><span className="mt-0.5 block truncate font-serif text-[20px] text-[#10231d]">{letter.senderName || "A pen pal"}{typeof letter.senderAge === "number" ? `, ${letter.senderAge}` : ""}</span><span className="mt-1 block text-xs text-black/50">Received {formatConversationTime(letter.delivered_at || letter.deliver_at) || "recently"}</span></span><Icon name="arrow" /></Link>)}
                {!delivered.length && <p className="rounded-lg border border-dashed border-black/15 px-5 py-6 text-sm leading-6 text-black/50">Delivered letters will appear here when they arrive.</p>}
              </div>
            </section>

            {outgoing.length > 0 && <section aria-labelledby="sent-mail-heading" className="mt-9 border-t border-black/10 pt-7"><div className="flex items-center gap-3 text-[#075d46]"><Icon name="mail" /><h3 id="sent-mail-heading" className="text-[11px] font-semibold uppercase tracking-[.19em]">Sent</h3></div><p className="mt-2 text-sm leading-6 text-black/55">Letters you have posted.</p><div className="mt-4 divide-y divide-black/[0.08] border-y border-black/[0.08]">{outgoing.slice(0, 3).map((letter) => <Link key={letter.id} href={`/app/messages/${letter.conversationId}`} className="flex items-center justify-between gap-4 py-3 text-sm hover:text-[#075d46]">{isLostInTransit(letter) ? <span className="min-w-0"><span className="block">Lost in transit</span><span className="mt-0.5 block truncate text-xs text-black/45">{lostInTransitCopy(letter)}</span></span> : <span>{formatDeliveryEta(letter.deliver_at, now)}</span>}<span className="shrink-0 text-xs text-black/45">{deliveryMilestone(letter, now)}</span></Link>)}</div></section>}
          </section>
        </section>
      </div>
    </main>
  );
}
