"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { sendMessage, respondPhotoAccess } from "@/app/app/messages/actions";
import { submitReport } from "@/app/app/reports/actions";

type Message = { id: string; body: string; created_at: string; sender_id: string | null; moderation_status?: "clear" | "flagged_for_review" | null };
type Introduction = { id: string; icebreaker: string; created_at: string; sender_id: string | null } | null;
type PendingPhotoRequest = { id: string };

function FormSubmitButton({ children, pendingLabel = "Saving…", className, disabled = false }: { children: React.ReactNode; pendingLabel?: string; className: string; disabled?: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending || disabled} className={`${className} disabled:cursor-not-allowed disabled:opacity-50`}>
      {pending ? pendingLabel : children}
    </button>
  );
}

const dayLabel = (value: string) => {
  const date = new Date(value);
  const today = new Date();
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const difference = Math.round((start(today) - start(date)) / 86400000);
  if (difference === 0) return "Today";
  if (difference === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "long" });
};

export default function ConversationThread({ conversationId, userId, messages, introduction, pendingRequests, otherName, otherUsername, messageSendBlocked = false, messageSendBlockedReason }: { conversationId: string; userId: string; messages: Message[]; introduction: Introduction; pendingRequests?: PendingPhotoRequest[]; otherName?: string; otherUsername?: string; messageSendBlocked?: boolean; messageSendBlockedReason?: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const previousCount = useRef(messages.length);
  const mounted = useRef(false);
  const [nearBottom, setNearBottom] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState("");
  const blockedReason = messageSendBlockedReason ?? "Wait for a reply before sending another message.";
  const grouped = useMemo(() => messages.map((message, index) => ({ message, previous: messages[index - 1], day: dayLabel(message.created_at), previousDay: index ? dayLabel(messages[index - 1].created_at) : null })), [messages]);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      const prompt = (event as CustomEvent<string>).detail;
      if (typeof prompt !== "string" || !prompt.trim()) return;
      setDraft(prompt);
      window.requestAnimationFrame(() => {
        const node = composerRef.current;
        if (!node) return;
        node.style.height = "auto";
        node.style.height = `${Math.min(node.scrollHeight, 180)}px`;
        node.focus();
        node.setSelectionRange(node.value.length, node.value.length);
      });
    };
    window.addEventListener("conversation-prompt", onPrompt);
    return () => window.removeEventListener("conversation-prompt", onPrompt);
  }, []);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    if (!mounted.current) {
      node.scrollTop = node.scrollHeight;
      mounted.current = true;
    } else if (messages.length > previousCount.current) {
      if (nearBottom) node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
      else window.setTimeout(() => setShowNew(true), 0);
    }
    previousCount.current = messages.length;
  }, [messages.length, nearBottom]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const update = () => {
      const close = node.scrollHeight - node.scrollTop - node.clientHeight < 96;
      setNearBottom(close);
      if (close) setShowNew(false);
    };
    node.addEventListener("scroll", update, { passive: true });
    update();
    return () => node.removeEventListener("scroll", update);
  }, []);

  const jumpToLatest = () => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
    setShowNew(false);
  };

  const resizeComposer = () => {
    const node = composerRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 180)}px`;
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (event.currentTarget.value.trim()) event.currentTarget.form?.requestSubmit();
    }
  };

  return (
    <section className="mt-6 overflow-hidden rounded-xl border border-[#deded5] bg-[#fbfaf6]" aria-label="Conversation">
      <div className="relative">
        <div ref={scrollRef} className="max-h-[min(64vh,720px)] overflow-y-auto px-5 py-5 sm:px-7 sm:py-7 lg:px-8" role="log" aria-live="polite" aria-relevant="additions" aria-label="Message history">
          <div className="space-y-1 pb-2">
            {!!pendingRequests?.length && <div className="mb-7 border border-[#d7dcca] bg-[#f0f3eb] px-5 py-4" aria-live="polite"><p className="text-sm text-[#1c2d26]">{otherName ?? "They"} would like to see your profile photo.</p><div className="mt-3 flex flex-wrap items-center gap-3"><Link href={otherUsername ? `/app/profile/${encodeURIComponent(otherUsername)}` : "/app/messages"} className="text-xs font-medium text-[#075d46] underline underline-offset-2">View profile</Link>{pendingRequests.map((request) => <div key={request.id} className="flex items-center gap-2"><form action={respondPhotoAccess}><input type="hidden" name="request_id" value={request.id} /><input type="hidden" name="conversation_id" value={conversationId} /><input type="hidden" name="decision" value="allowed" /><FormSubmitButton className="rounded-md bg-[#087456] px-3 py-2 text-xs font-medium text-white">Allow</FormSubmitButton></form><form action={respondPhotoAccess}><input type="hidden" name="request_id" value={request.id} /><input type="hidden" name="conversation_id" value={conversationId} /><input type="hidden" name="decision" value="declined" /><FormSubmitButton className="rounded-md border border-black/10 px-3 py-2 text-xs font-medium text-black/60 hover:bg-black/[0.04]">Decline</FormSubmitButton></form></div>)}</div></div>}
            {grouped.map(({ message, previous, day, previousDay }) => {
              const mine = message.sender_id === userId;
              const groupedWithPrevious = previous?.sender_id === message.sender_id && previousDay === day;
              const isIntroduction = introduction?.sender_id === message.sender_id && introduction.icebreaker === message.body;
              const surface = isIntroduction ? "border-[#dcc8a7] bg-[#fffaf1]" : mine ? "border-[#d1dccb] bg-[#e6ede2]" : "border-[#e4dfd7] bg-[#fffdfa]";
              return <div key={message.id}>
                {day !== previousDay && <div className="my-7 flex items-center gap-4 text-[10px] font-medium uppercase tracking-[.2em] text-black/35"><span className="h-px flex-1 bg-black/10" /><span>{day}</span><span className="h-px flex-1 bg-black/10" /></div>}
                <article className={`${groupedWithPrevious ? "mt-2" : "mt-6"} max-w-[84%] sm:max-w-[78%] ${mine ? "ml-auto text-right" : "mr-auto text-left"}`}>
                  {isIntroduction && <p className={`mb-2 text-[10px] font-semibold uppercase tracking-[.18em] text-[#087456] ${mine ? "text-right" : "text-left"}`}>Introduction</p>}
                  <div className={`inline-block border px-4 py-3.5 text-left shadow-[0_1px_0_rgba(35,57,47,0.03)] sm:px-5 ${isIntroduction ? "rounded-xl" : "rounded-lg"} ${surface}`}>
                    <p className="whitespace-pre-wrap break-words text-[15px] leading-7 text-[#1c2d26]"><span className="sr-only">{mine ? "You" : (otherName ?? "Participant")}: </span>{message.body}</p>
                    {message.moderation_status === "flagged_for_review" && <p className="mt-2 text-[10px] font-semibold uppercase tracking-[.12em] text-black/45">Flagged for review</p>}
                    <time className="mt-2 block text-[10px] text-black/40" dateTime={message.created_at}>{new Date(message.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>
                  </div>
                  <details onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.currentTarget.removeAttribute("open"); } }} className={`group relative mt-1 ${mine ? "text-right" : "text-left"}`}>
                    <summary className="inline-flex cursor-pointer list-none px-1 text-[16px] leading-none text-black/25 hover:text-black/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#087456]" aria-label="Message actions">…</summary>
                    <div className={`absolute top-6 z-10 w-64 border border-black/10 bg-[#fffdfa] p-3 text-left shadow-lg ${mine ? "right-0" : "left-0"}`}>
                      <form action={submitReport} className="space-y-2"><input type="hidden" name="target_type" value="message" /><input type="hidden" name="target_id" value={message.id} /><input type="hidden" name="return_to" value={`/app/messages/${encodeURIComponent(conversationId)}`} /><label className="block text-xs font-medium text-black/60" htmlFor={`reason-${message.id}`}>Report this message</label><select id={`reason-${message.id}`} name="reason" className="field w-full text-xs"><option value="spam">Spam</option><option value="scam/fraud">Scam or fraud</option><option value="harassment">Harassment</option><option value="sexual/inappropriate content">Sexual or inappropriate content</option><option value="hate/abuse">Hate or abuse</option><option value="fake profile/impersonation">Fake profile or impersonation</option><option value="underage concern">Underage concern</option><option value="other">Other</option></select><input name="details" aria-label="Optional report details" className="field w-full text-xs" placeholder="Tell us what happened (optional)" /><button className="w-full rounded-md border border-black/15 px-3 py-2 text-xs text-black/65 hover:bg-black/[0.04]">Submit message report</button></form>
                    </div>
                  </details>
                </article>
              </div>;
            })}
            {!messages.length && <p className="border-y border-black/10 py-12 text-center text-sm leading-6 text-black/45">No messages yet. Start the conversation below.</p>}
          </div>
        </div>
        {!nearBottom && showNew && <button type="button" onClick={jumpToLatest} className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-[#087456]/25 bg-[#f7f5ef] px-4 py-2 text-xs font-medium text-[#075d46] shadow-sm">New messages ↓</button>}
      </div>
      <form id="message-composer" action={sendMessage} className="border-t border-black/10 bg-[#fffdfa]/70 px-4 py-4 sm:px-5"><input type="hidden" name="conversation_id" value={conversationId} /><div className="flex items-end gap-3"><textarea ref={composerRef} name="body" value={draft} required rows={1} disabled={messageSendBlocked} onChange={(event) => setDraft(event.target.value)} onInput={resizeComposer} onKeyDown={handleKeyDown} className="field min-h-12 max-h-44 flex-1 resize-none rounded-lg bg-[#fffdfa] leading-7 disabled:cursor-not-allowed disabled:bg-black/[0.03] disabled:text-black/40" placeholder={messageSendBlocked ? (messageSendBlockedReason ? "Messaging unavailable" : "Waiting for a reply…") : "Write a message…"} aria-label="Message" aria-describedby={messageSendBlocked ? "message-composer-status" : "message-composer-help"} /> <FormSubmitButton pendingLabel="Sending…" disabled={messageSendBlocked} className="btn-primary shrink-0 rounded-lg px-5">Send</FormSubmitButton></div>{messageSendBlocked ? <p id="message-composer-status" className="mt-2 text-sm text-[#075d46]" role="status">{blockedReason}</p> : <p id="message-composer-help" className="mt-2 text-[11px] text-black/35">Enter to send · Shift + Enter for a new line</p>}</form>
    </section>
  );
}
