"use client";

import { useTranslations } from "next-intl";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { cancelSnailMail, markSnailMailRead, sendSnailMail } from "@/app/app/messages/actions";
import { hasSnailMailArrived as hasArrived, isLostInTransit, lostInTransitCopy } from "@/app/app/messages/snailMailStory";
import SnailMailJourneyMap from "@/app/app/messages/SnailMailJourneyMap";

export type SnailMailLetter = {
  id: string;
  sender_id: string;
  recipient_id: string;
  sent_at: string;
  deliver_at: string;
  delivered_at: string | null;
  recipient_read_at: string | null;
  body: string | null;
  body_available: boolean;
  unread: boolean;
  letter_status: "incoming" | "delivered" | "outgoing" | "lost_in_transit" | string;
  transport_mode?: "express" | "standard" | "economy" | "air_mail" | "rail" | "sea_mail" | "rare_pigeon" | string;
  distance_band?: "nearby" | "in_country" | "regional" | "long_distance" | string;
  base_delivery_hours?: number;
  transport_multiplier?: number;
  story_seed?: number;
  story_variant?: number;
};

function SubmitButton({ children, pendingLabel, className, disabled = false }: { children: React.ReactNode; pendingLabel: string; className: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending || disabled} className={`${className} disabled:cursor-not-allowed disabled:opacity-50`}>{pending ? pendingLabel : children}</button>;
}

function progress(letter: SnailMailLetter, now: number) {
  const start = new Date(letter.sent_at).getTime();
  const end = new Date(letter.deliver_at).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 100;
  return Math.max(0, Math.min(100, ((now - start) / (end - start)) * 100));
}

function deliveryCopy(letter: SnailMailLetter, now: number) {
  if (isLostInTransit(letter)) return lostInTransitCopy(letter);
  if (letter.transport_mode === "rare_pigeon" && !hasArrived(letter, now)) {
    return "A very determined pigeon has accepted the assignment.";
  }
  if (letter.letter_status === "outgoing") {
    if (hasArrived(letter, now)) return "Delivered";
    return letter.story_variant === 1 ? "Your letter is travelling quietly." : "Your letter is making its way there.";
  }
  if (hasArrived(letter, now)) return "Your letter has arrived.";
  return "A letter is on its way. The message opens when it arrives.";
}

function transportLabel(mode: SnailMailLetter["transport_mode"]) {
  switch (mode) {
    case "air_mail": return "Air mail";
    case "sea_mail": return "Sea mail";
    case "rare_pigeon": return "Rare pigeon";
    case "express": return "Express";
    case "economy": return "Economy";
    case "rail": return "Rail";
    default: return "Standard";
  }
}

function milestone(letter: SnailMailLetter, now: number) {
  if (isLostInTransit(letter)) return "Lost in transit";
  const value = progress(letter, now);
  if (hasArrived(letter, now)) return "Delivered";
  if (value < 12) return "Posted";
  if (value < 28) return "Sorting";
  if (value < 58) {
    return letter.transport_mode === "sea_mail" || letter.distance_band === "long_distance" ? "Crossing the sea" : "Crossing the border";
  }
  if (value < 86) return "In transit";
  return "Out for delivery";
}

export default function SnailMailPanel({ conversationId, userId, letters, now, canCompose = false, composeBlockedReason = null, compact = false, viewerCountry = null, otherCountry = null }: { conversationId: string; userId: string; letters: SnailMailLetter[]; now: number; canCompose?: boolean; composeBlockedReason?: string | null; compact?: boolean; viewerCountry?: string | null; otherCountry?: string | null }) {
  const t = useTranslations();
  const [composing, setComposing] = useState(false);
  const [body, setBody] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [currentNow, setCurrentNow] = useState(now);
  useEffect(() => {
    const interval = window.setInterval(() => setCurrentNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);
  const outgoingLetterIsBlocking = letters.some((letter) => letter.sender_id === userId && !isLostInTransit(letter) && (!letter.delivered_at || !letter.recipient_read_at));
  const localBlockedReason = letters.some((letter) => letter.sender_id === userId && !isLostInTransit(letter) && !hasArrived(letter, currentNow))
    ? "Your last letter is still on its way. Please wait before sending another."
    : outgoingLetterIsBlocking
      ? "Your last delivered letter is waiting to be opened."
      : null;
  const canWriteLetter = canCompose && !outgoingLetterIsBlocking;
  const composerBlocked = !canCompose || outgoingLetterIsBlocking;
  const blockedReason = composeBlockedReason ?? localBlockedReason;
  const openComposer = () => {
    setComposing(true);
    setIdempotencyKey((current) => current ?? (globalThis.crypto?.randomUUID?.() ?? null));
  };

  if (compact) {
    const latestLetter = [...letters].sort((a, b) => Date.parse(b.sent_at) - Date.parse(a.sent_at))[0];
    const latestIsMine = latestLetter?.sender_id === userId;
    const latestCancelled = Boolean(latestLetter && isLostInTransit(latestLetter));
    const latestInTransit = latestLetter && !latestCancelled && !hasArrived(latestLetter, currentNow);
    return (
      <section className="rounded-xl border border-[#deded5] bg-[#fbfaf6] p-5 sm:p-6" aria-labelledby="snail-mail-heading">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="eyebrow">{t("app.snail.optional")}</p>
            <h2 id="snail-mail-heading" className="section-title mt-1">{t("app.snail.title")}</h2>
          </div>
          <span aria-hidden="true" className="text-xl text-brand/70">✉</span>
        </div>
        <p className="section-description mt-2">{t("app.snail.arrive")}</p>
        {latestLetter ? <div className="mt-5 border-t border-black/10 pt-4">
          <p className="text-sm font-medium text-primary">{latestCancelled ? "Lost in transit" : latestInTransit ? (latestIsMine ? "Letter in transit" : "A letter is on its way") : latestIsMine ? "Your letter has arrived" : "Letter delivered"}</p>
          <p className="section-description mt-1">{deliveryCopy(latestLetter, currentNow)}</p>
          <p className="mt-1 text-xs text-black/40">{transportLabel(latestLetter.transport_mode)} · {milestone(latestLetter, currentNow)}</p>
          {!latestCancelled && <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[#e4e8df]" role="progressbar" aria-valuenow={Math.round(progress(latestLetter, currentNow))} aria-valuemin={0} aria-valuemax={100} aria-label={`Letter delivery progress ${Math.round(progress(latestLetter, currentNow))} percent`}><span className="block h-full rounded-full bg-[#087456]" style={{ width: `${progress(latestLetter, currentNow)}%` }} /></div>}
          {!latestCancelled && <SnailMailJourneyMap origin={latestIsMine ? viewerCountry : otherCountry} destination={latestIsMine ? otherCountry : viewerCountry} progress={progress(latestLetter, currentNow)} compact />}
          {latestLetter.body_available && latestLetter.body ? <details className="mt-4"><summary className="cursor-pointer text-sm font-medium text-brand underline underline-offset-2">{t("app.snail.read")}</summary><p className="mt-3 whitespace-pre-wrap border-l-2 border-[#087456]/30 pl-3 text-sm leading-6 text-primary">{latestLetter.body}</p></details> : <p className="mt-4 text-xs italic text-black/45">{latestCancelled ? "This letter was lost before it reached you." : "The letter is sealed until delivery."}</p>}
          {!latestCancelled && !latestIsMine && latestLetter.body_available && !latestLetter.recipient_read_at && <form action={markSnailMailRead} className="mt-3"><input type="hidden" name="conversation_id" value={conversationId} /><input type="hidden" name="letter_id" value={latestLetter.id} /><SubmitButton pendingLabel="Opening…" className="rounded-md border border-[#087456]/30 px-3 py-2 text-xs text-brand">{t("app.snail.open")}</SubmitButton></form>}
          {latestIsMine && latestInTransit && <form action={cancelSnailMail} className="mt-3" onSubmit={(event) => { if (!window.confirm("Stop this letter while it is still in transit? The recipient will see it as lost in transit.")) event.preventDefault(); }}><input type="hidden" name="conversation_id" value={conversationId} /><input type="hidden" name="letter_id" value={latestLetter.id} /><SubmitButton pendingLabel="Cancelling…" className="rounded-md border border-[#b05b4f]/35 px-3 py-2 text-xs text-[#8d443b]">{t("app.snail.cancel")}</SubmitButton></form>}
        </div> : <p className="mt-5 border-t border-black/10 pt-4 text-sm leading-6 text-black/50">{t("app.snail.empty")}</p>}
        {!composing && canWriteLetter && <button type="button" onClick={openComposer} className="mt-5 w-full rounded-md border border-[#087456]/30 px-3 py-2.5 text-sm text-brand hover:bg-[#087456]/[0.06]">{t("app.snail.write")}</button>}
        {!composing && !canWriteLetter && <div className="mt-5 border-t border-black/10 pt-4"><button type="button" disabled aria-disabled="true" className="w-full rounded-md border border-[#087456]/20 px-3 py-2.5 text-sm text-brand/50 disabled:cursor-not-allowed disabled:opacity-70">{t("app.snail.write")}</button><p className="mt-2 text-xs leading-5 text-black/45" role="status">{blockedReason ?? "New letters aren&apos;t available with the current communication preferences."}</p></div>}
        {composing && <form action={sendSnailMail} className="mt-5 border-t border-black/10 pt-5"><input type="hidden" name="conversation_id" value={conversationId} /><input type="hidden" name="idempotency_key" value={idempotencyKey ?? ""} /><label htmlFor="snail-mail-body" className="text-sm font-medium text-primary">{t("app.snail.yourLetter")}</label>{composerBlocked && <p id="snail-mail-compose-status" className="mt-2 text-sm text-black/55" role="status">{blockedReason ?? "New letters aren&apos;t available right now."}</p>}<textarea id="snail-mail-body" name="body" value={body} onChange={(event) => setBody(event.target.value)} rows={5} maxLength={5000} required disabled={composerBlocked} aria-describedby={composerBlocked ? "snail-mail-compose-status" : undefined} className="field mt-2 min-h-28 w-full resize-y leading-7 disabled:cursor-not-allowed disabled:bg-black/[0.03]" placeholder="Write something thoughtful…" /><div className="mt-2 flex items-center justify-between text-xs text-black/45"><span>{t("app.snail.limit")}</span><span>{body.length}/5000</span></div><div className="mt-4 flex items-center gap-3"><SubmitButton disabled={composerBlocked} pendingLabel="Sending…" className="btn-primary flex-1">{t("app.snail.send")}</SubmitButton><button type="button" onClick={() => { setComposing(false); setBody(""); }} className="rounded-md px-3 py-2 text-sm text-black/55 hover:bg-black/[0.04]">{t("app.snail.cancelCompose")}</button></div></form>}
      </section>
    );
  }

  return (
    <section className="mt-8 border-y border-[#087456]/15 py-5" aria-labelledby="snail-mail-heading">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">{t("app.snail.optional")}</p>
          <h2 id="snail-mail-heading" className="section-title mt-1">{t("app.snail.title")}</h2>
          <p className="section-description mt-1 max-w-xl">{t("app.snail.description")}</p>
        </div>
        {!composing && canWriteLetter && <button type="button" onClick={openComposer} className="rounded-md border border-[#087456]/30 px-3 py-2 text-sm text-brand hover:bg-[#087456]/[0.06]">{t("app.snail.write")}</button>}
        {!composing && !canWriteLetter && <div className="flex flex-col items-end gap-2 text-right">
          <button type="button" disabled aria-disabled="true" className="rounded-md border border-[#087456]/20 px-3 py-2 text-sm text-brand/50 disabled:cursor-not-allowed disabled:opacity-70">{t("app.snail.write")}</button>
          <p className="max-w-[18rem] text-xs leading-5 text-black/45" role="status">{blockedReason ?? "New letters aren&apos;t available with the current communication preferences."}</p>
        </div>}
      </div>

      {composing && <form action={sendSnailMail} className="mt-5 border-t border-black/10 pt-5">
        <input type="hidden" name="conversation_id" value={conversationId} />
        <input type="hidden" name="idempotency_key" value={idempotencyKey ?? ""} />
        <label htmlFor="snail-mail-body" className="text-sm font-medium text-primary">{t("app.snail.yourLetter")}</label>
        {composerBlocked && <p id="snail-mail-compose-status" className="mt-2 text-sm text-black/55" role="status">{blockedReason ?? "New letters aren&apos;t available right now."}</p>}
        <textarea id="snail-mail-body" name="body" value={body} onChange={(event) => setBody(event.target.value)} rows={6} maxLength={5000} required disabled={composerBlocked} aria-describedby={composerBlocked ? "snail-mail-compose-status" : undefined} className="field mt-2 min-h-36 w-full resize-y leading-7 disabled:cursor-not-allowed disabled:bg-black/[0.03]" placeholder="Write something thoughtful…" />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-xs text-black/45"><span>{t("app.snail.limit")}</span><span>{body.length}/5000</span></div>
        <div className="mt-4 flex items-center gap-3"><SubmitButton disabled={composerBlocked} pendingLabel="Sending…" className="btn-primary">{t("app.snail.send")}</SubmitButton><button type="button" onClick={() => { setComposing(false); setBody(""); }} className="rounded-md px-3 py-2 text-sm text-black/55 hover:bg-black/[0.04]">{t("app.snail.cancelCompose")}</button></div>
      </form>}

      {letters.length > 0 && <div className="mt-6 space-y-5" aria-live="polite">
        {letters.map((letter) => {
          const isMine = letter.sender_id === userId;
          const cancelled = isLostInTransit(letter);
          const inTransit = !cancelled && !hasArrived(letter, currentNow);
          const value = progress(letter, currentNow);
          return <article key={letter.id} className="border-t border-black/[0.08] pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-medium text-primary">{cancelled ? "Lost in transit" : isMine ? "Your letter" : "Incoming letter"}</p>
              <time className="text-xs text-black/40" dateTime={letter.sent_at}>{new Date(letter.sent_at).toLocaleDateString()}</time>
            </div>
            <p className="mt-1 text-sm text-black/55">{deliveryCopy(letter, currentNow)}</p>
            <p className="mt-1 text-xs text-black/40" aria-label="Delivery milestone">{transportLabel(letter.transport_mode)} · {milestone(letter, currentNow)}</p>
            {!cancelled && <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[#e4e8df]" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100} aria-label={`Letter delivery progress ${Math.round(value)} percent`}><span className="block h-full rounded-full bg-[#087456] transition-[width]" style={{ width: `${value}%` }} /></div>}
            {!cancelled && <SnailMailJourneyMap origin={isMine ? viewerCountry : otherCountry} destination={isMine ? otherCountry : viewerCountry} progress={value} />}
            {letter.body_available && letter.body ? <div className="mt-4 whitespace-pre-wrap border-l-2 border-[#087456]/30 pl-4 text-[15px] leading-7 text-primary">{letter.body}</div> : <p className="mt-4 text-sm italic text-black/45">{cancelled ? "This letter was lost before it reached you." : "The letter is sealed until delivery."}</p>}
            {!cancelled && !isMine && letter.body_available && !letter.recipient_read_at && <form action={markSnailMailRead} className="mt-3"><input type="hidden" name="conversation_id" value={conversationId} /><input type="hidden" name="letter_id" value={letter.id} /><SubmitButton pendingLabel="Opening…" className="rounded-md border border-[#087456]/30 px-3 py-2 text-xs text-brand">{t("app.snail.open")}</SubmitButton></form>}
            {isMine && inTransit && <form action={cancelSnailMail} className="mt-3" onSubmit={(event) => { if (!window.confirm("Stop this letter while it is still in transit? The recipient will see it as lost in transit.")) event.preventDefault(); }}><input type="hidden" name="conversation_id" value={conversationId} /><input type="hidden" name="letter_id" value={letter.id} /><SubmitButton pendingLabel="Cancelling…" className="rounded-md border border-[#b05b4f]/35 px-3 py-2 text-xs text-[#8d443b]">{t("app.snail.cancel")}</SubmitButton></form>}
          </article>;
        })}
      </div>}
    </section>
  );
}
