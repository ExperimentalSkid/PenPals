"use client";

import { useTranslations } from "next-intl";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { sendMessage, respondPhotoAccess } from "@/app/app/messages/actions";
import { submitReport } from "@/app/app/reports/actions";
import { createClient } from "@/lib/supabase/client";

type Message = { id: string; body: string; created_at: string; sender_id: string | null; moderation_status?: "clear" | "flagged_for_review" | null; reply_to_message_id?: string | null };
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

const dayLabel = (value: string, t: (key: string) => string) => {
  const date = new Date(value);
  const today = new Date();
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const difference = Math.round((start(today) - start(date)) / 86400000);
  if (difference === 0) return t("app.messages.today");
  if (difference === 1) return t("app.messages.yesterday");
  return date.toLocaleDateString(undefined, { day: "numeric", month: "long" });
};

const highlightedText = (text: string, query: string) => {
  const needle = query.trim();
  if (!needle) return text;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.split(new RegExp(`(${escaped})`, "ig")).map((part, index) =>
    part.toLocaleLowerCase() === needle.toLocaleLowerCase()
      ? <mark key={`${part}-${index}`} className="rounded-sm bg-[#f2df9d]/70 px-0.5 text-inherit">{part}</mark>
      : part
  );
};

export default function ConversationThread({ conversationId, userId, messages, hasOlderMessages, historyLoadFailed = false, introduction, pendingRequests, otherName, otherUsername, otherUserId, initialOtherLastReadAt, messageSendBlocked = false, messageSendBlockedReason }: { conversationId: string; userId: string; messages: Message[]; hasOlderMessages: boolean; historyLoadFailed?: boolean; introduction: Introduction; pendingRequests?: PendingPhotoRequest[]; otherName?: string; otherUsername?: string; otherUserId?: string | null; initialOtherLastReadAt?: string | null; messageSendBlocked?: boolean; messageSendBlockedReason?: string }) {
  const t = useTranslations();
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const previousCount = useRef(messages.length);
  const mounted = useRef(false);
  const [nearBottom, setNearBottom] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Message[]>([]);
  const [searchIndex, setSearchIndex] = useState(0);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const draftStorageKey = `penpals:message-draft:${userId}:${conversationId}`;
  const pendingDraftStorageKey = `penpals:message-pending:${userId}:${conversationId}`;
  const pendingReplyStorageKey = `penpals:message-pending-reply:${userId}:${conversationId}`;
  const [liveMessages, setLiveMessages] = useState(messages);
  const [replyTargets, setReplyTargets] = useState<Record<string, Message>>({});
  const [hasOlder, setHasOlder] = useState(hasOlderMessages);
  const loadingOlderRef = useRef(false);
  const prependScrollHeightRef = useRef<number | null>(null);
  const [otherTyping, setOtherTyping] = useState(false);
  const [selfTyping, setSelfTyping] = useState(false);
  const [otherLastReadAt, setOtherLastReadAt] = useState(initialOtherLastReadAt ?? null);
  const typingChannelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const typingStopTimerRef = useRef<number | null>(null);
  const typingHideTimerRef = useRef<number | null>(null);
  const lastTypingSentAtRef = useRef(0);
  const supabase = useMemo(() => createClient(), []);
  const blockedReason = messageSendBlockedReason ?? "Wait for a reply before sending another message.";
  const messageLookup = useMemo(() => {
    const lookup = new Map<string, Message>();
    for (const message of liveMessages) lookup.set(message.id, message);
    for (const message of Object.values(replyTargets)) lookup.set(message.id, message);
    return lookup;
  }, [liveMessages, replyTargets]);
  const grouped = useMemo(() => liveMessages.map((message, index) => ({ message, previous: liveMessages[index - 1], day: dayLabel(message.created_at, t), previousDay: index ? dayLabel(liveMessages[index - 1].created_at, t) : null })), [liveMessages, t]);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const pendingDraft = window.sessionStorage.getItem(pendingDraftStorageKey);
      const pendingReply = window.sessionStorage.getItem(pendingReplyStorageKey);
      if (params.get("sent") === "1") {
        if (pendingDraft && window.localStorage.getItem(draftStorageKey) === pendingDraft) window.localStorage.removeItem(draftStorageKey);
        window.sessionStorage.removeItem(pendingDraftStorageKey);
        window.sessionStorage.removeItem(pendingReplyStorageKey);
        // Restoring/clearing persisted composer state is an intentional mount-time synchronization.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setReplyTo(null);
        params.delete("sent");
        const nextSearch = params.toString();
        window.history.replaceState({}, "", `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`);
      } else if (params.has("error")) {
        window.sessionStorage.removeItem(pendingDraftStorageKey);
        if (pendingReply) {
          try { setReplyTo(JSON.parse(pendingReply) as Message); } catch { setReplyTo(null); }
        }
        window.sessionStorage.removeItem(pendingReplyStorageKey);
      }
      setDraft(window.localStorage.getItem(draftStorageKey) ?? "");
    } catch {
      setDraft("");
    }
  }, [draftStorageKey, pendingDraftStorageKey, pendingReplyStorageKey]);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      const prompt = (event as CustomEvent<string>).detail;
      if (typeof prompt !== "string" || !prompt.trim()) return;
      setDraft(prompt);
      try { window.localStorage.setItem(draftStorageKey, prompt); } catch {}
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
  }, [draftStorageKey]);

  useEffect(() => {
    // Merge refreshed server props into the realtime message cache.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLiveMessages((current) => {
      const byId = new Map(current.map((message) => [message.id, message]));
      for (const message of messages) byId.set(message.id, message);
      return [...byId.values()].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    });
  }, [messages]);

  useEffect(() => {
    const loadedIds = new Set(liveMessages.map((message) => message.id));
    const missingReplyIds = [...new Set(liveMessages.map((message) => message.reply_to_message_id).filter((id): id is string => Boolean(id) && !loadedIds.has(id!) && !replyTargets[id!]))];
    if (!missingReplyIds.length) return;
    let active = true;
    void supabase
      .from("messages")
      .select("id,body,created_at,sender_id,moderation_status,reply_to_message_id")
      .eq("conversation_id", conversationId)
      .in("id", missingReplyIds)
      .then(({ data }) => {
        if (!active || !data?.length) return;
        setReplyTargets((current) => {
          const next = { ...current };
          for (const message of data as Message[]) next[message.id] = message;
          return next;
        });
      });
    return () => { active = false; };
  }, [conversationId, liveMessages, replyTargets, supabase]);

  useEffect(() => {
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      if (data.session?.access_token) await supabase.realtime.setAuth(data.session.access_token);
      if (!active) return;
      channel = supabase
        .channel(`messages:${conversationId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, (payload) => {
          const incoming = payload.new as Message;
          if (!active || incoming.sender_id === userId) return;
          setLiveMessages((current) => current.some((message) => message.id === incoming.id) ? current : [...current, incoming]);
        })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversation_participants", filter: `conversation_id=eq.${conversationId}` }, (payload) => {
          const participant = payload.new as { user_id?: string; last_read_at?: string | null };
          if (!active || !otherUserId || participant.user_id !== otherUserId) return;
          setOtherLastReadAt(participant.last_read_at ?? null);
        });
      channel.subscribe();
    })().catch(() => { if (active) console.warn("Could not start realtime messages."); });
    return () => {
      active = false;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [conversationId, otherUserId, supabase, userId]);

  useEffect(() => {
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      if (data.session?.access_token) await supabase.realtime.setAuth(data.session.access_token);
      if (!active) return;
      channel = supabase.channel(`typing:conversation:${conversationId}`, { config: { private: true, broadcast: { self: false } } });
      typingChannelRef.current = channel;
      channel.on("broadcast", { event: "typing" }, ({ payload }) => {
        if (!active || payload?.user_id === userId) return;
        if (typingHideTimerRef.current) window.clearTimeout(typingHideTimerRef.current);
        setOtherTyping(payload?.typing === true);
        if (payload?.typing === true) {
          typingHideTimerRef.current = window.setTimeout(() => setOtherTyping(false), 3500);
        }
      });
      channel.subscribe();
    })().catch(() => { if (active) console.warn("Could not start typing indicator."); });
    return () => {
      active = false;
      if (typingStopTimerRef.current) window.clearTimeout(typingStopTimerRef.current);
      if (typingHideTimerRef.current) window.clearTimeout(typingHideTimerRef.current);
      typingChannelRef.current = null;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [conversationId, supabase, userId]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    if (!mounted.current) {
      node.scrollTop = node.scrollHeight;
      mounted.current = true;
    } else if (prependScrollHeightRef.current !== null) {
      node.scrollTop += node.scrollHeight - prependScrollHeightRef.current;
      prependScrollHeightRef.current = null;
    } else if (liveMessages.length > previousCount.current) {
      if (nearBottom) node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
      else window.setTimeout(() => setShowNew(true), 0);
    }
    previousCount.current = liveMessages.length;
  }, [liveMessages.length, nearBottom]);

  const loadOlderMessages = useCallback(async () => {
    if (!hasOlder || loadingOlderRef.current) return;
    const node = scrollRef.current;
    const oldest = liveMessages[0];
    if (!node || !oldest) return;

    loadingOlderRef.current = true;
    const previousScrollHeight = node.scrollHeight;
    try {
      const { data, error } = await supabase
        .from("messages")
        .select("id,body,created_at,sender_id,moderation_status,reply_to_message_id")
        .eq("conversation_id", conversationId)
        .lt("created_at", oldest.created_at)
        .order("created_at", { ascending: false })
        .limit(51);
      if (error) return;

      const page = (data ?? []) as Message[];
      const older = page.slice(0, 50).reverse();
      if (older.length) {
        prependScrollHeightRef.current = previousScrollHeight;
        setLiveMessages((current) => {
          const existing = new Set(current.map((message) => message.id));
          return [...older.filter((message) => !existing.has(message.id)), ...current];
        });
      }
      setHasOlder(page.length > 50);
    } finally {
      loadingOlderRef.current = false;
    }
  }, [conversationId, hasOlder, liveMessages, supabase]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const update = () => {
      const close = node.scrollHeight - node.scrollTop - node.clientHeight < 96;
      setNearBottom(close);
      if (close) setShowNew(false);
      if (node.scrollTop < 80) void loadOlderMessages();
    };
    node.addEventListener("scroll", update, { passive: true });
    update();
    return () => node.removeEventListener("scroll", update);
  }, [loadOlderMessages]);

  const jumpToLatest = () => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
    setShowNew(false);
  };

  const sendTyping = (typing: boolean) => {
    setSelfTyping(typing);
    const channel = typingChannelRef.current;
    if (!channel) return;
    void channel.send({ type: "broadcast", event: "typing", payload: { user_id: userId, typing } });
  };

  const noteTyping = (value: string) => {
    if (messageSendBlocked) return;
    if (!value.trim()) {
      sendTyping(false);
      return;
    }
    const now = Date.now();
    if (now - lastTypingSentAtRef.current > 1200) {
      sendTyping(true);
      lastTypingSentAtRef.current = now;
    }
    if (typingStopTimerRef.current) window.clearTimeout(typingStopTimerRef.current);
    typingStopTimerRef.current = window.setTimeout(() => sendTyping(false), 1800);
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
      if (event.currentTarget.value.trim()) {
        sendTyping(false);
        event.currentTarget.form?.requestSubmit();
      }
    }
  };

  const focusSearchResult = (message: Message) => {
    setLiveMessages((current) => {
      if (current.some((item) => item.id === message.id)) return current;
      return [...current, message].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    });
    window.requestAnimationFrame(() => {
      document.getElementById(`message-${message.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  const runSearch = async () => {
    const query = searchQuery.trim();
    setSearchError("");
    if (!query) {
      setAppliedSearch("");
      setSearchResults([]);
      setSearchIndex(0);
      return;
    }
    setSearching(true);
    try {
      const { data, error } = await supabase
        .from("messages")
        .select("id,body,created_at,sender_id,moderation_status,reply_to_message_id")
        .eq("conversation_id", conversationId)
        .ilike("body", `%${query.replace(/[%_]/g, "\\$&")}%`)
        .order("created_at", { ascending: true })
        .limit(100);
      if (error) {
        setSearchError(t("app.messages.searchUnavailable"));
        return;
      }
      const results = (data ?? []) as Message[];
      setAppliedSearch(query);
      setSearchResults(results);
      setSearchIndex(0);
      if (results[0]) focusSearchResult(results[0]);
    } finally {
      setSearching(false);
    }
  };

  const moveSearch = (direction: -1 | 1) => {
    if (!searchResults.length) return;
    const next = (searchIndex + direction + searchResults.length) % searchResults.length;
    setSearchIndex(next);
    focusSearchResult(searchResults[next]);
  };

  const activeSearchId = searchResults[searchIndex]?.id ?? null;

  return (
    <section className="mt-6 overflow-hidden rounded-xl border border-[#deded5] bg-[#fbfaf6]" aria-label={t("app.messages.conversation")}>
      <div className="border-b border-black/10 bg-[#fffdfa]/70 px-4 py-3 sm:px-5">
        <form onSubmit={(event) => { event.preventDefault(); void runSearch(); }} className="flex flex-wrap items-center gap-2" role="search">
          <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="field min-w-0 flex-1 rounded-md text-sm" placeholder={t("app.messages.searchPlaceholder")} aria-label={t("app.messages.searchLabel")} />
          <button type="submit" disabled={searching} className="rounded-md border border-[#d7d0c3] px-3 py-2 text-xs font-medium text-brand hover:bg-white/75 disabled:opacity-50">{searching ? t("app.messages.searching") : t("app.messages.search")}</button>
          {appliedSearch && <><span className="min-w-[4.5rem] text-center text-xs text-black/45">{searchResults.length ? t("app.messages.searchPosition", { current: searchIndex + 1, total: searchResults.length }) : t("app.messages.noMatches")}</span><button type="button" disabled={!searchResults.length} onClick={() => moveSearch(-1)} className="rounded-md border border-[#d7d0c3] px-2.5 py-2 text-xs text-black/55 hover:bg-white/75 disabled:opacity-35" aria-label={t("app.messages.previousSearchResult")}>↑</button><button type="button" disabled={!searchResults.length} onClick={() => moveSearch(1)} className="rounded-md border border-[#d7d0c3] px-2.5 py-2 text-xs text-black/55 hover:bg-white/75 disabled:opacity-35" aria-label={t("app.messages.nextSearchResult")}>↓</button><button type="button" onClick={() => { setSearchQuery(""); setAppliedSearch(""); setSearchResults([]); setSearchIndex(0); setSearchError(""); }} className="px-2 py-2 text-xs text-black/40 hover:text-black/70" aria-label={t("app.messages.clearSearch")}>×</button></>}
        </form>
        {searchError && <p className="mt-2 text-xs text-red-700" role="alert">{searchError}</p>}
      </div>
      <div className="relative">
        <div ref={scrollRef} className="max-h-[min(64vh,720px)] overflow-y-auto px-5 py-5 sm:px-7 sm:py-7 lg:px-8" role="log" aria-live="polite" aria-relevant="additions" aria-label={t("app.messages.messageHistory")}>
          <div className="space-y-1 pb-2">
            {!!pendingRequests?.length && <div className="mb-7 border border-[#d7dcca] bg-[#f0f3eb] px-5 py-4" aria-live="polite"><p className="text-sm text-primary">{t("app.messages.photoRequest", { name: otherName ?? t("app.messages.they") })}</p><div className="mt-3 flex flex-wrap items-center gap-3"><Link href={otherUsername ? `/app/profile/${encodeURIComponent(otherUsername)}` : "/app/messages"} className="text-xs font-medium text-brand underline underline-offset-2">{t("app.messages.viewProfile")}</Link>{pendingRequests.map((request) => <div key={request.id} className="flex items-center gap-2"><form action={respondPhotoAccess}><input type="hidden" name="request_id" value={request.id} /><input type="hidden" name="conversation_id" value={conversationId} /><input type="hidden" name="decision" value="allowed" /><FormSubmitButton className="rounded-md bg-[#087456] px-3 py-2 text-xs font-medium text-white">{t("app.messages.allow")}</FormSubmitButton></form><form action={respondPhotoAccess}><input type="hidden" name="request_id" value={request.id} /><input type="hidden" name="conversation_id" value={conversationId} /><input type="hidden" name="decision" value="declined" /><FormSubmitButton className="rounded-md border border-black/10 px-3 py-2 text-xs font-medium text-black/60 hover:bg-black/[0.04]">{t("app.messages.decline")}</FormSubmitButton></form></div>)}</div></div>}
            {grouped.map(({ message, previous, day, previousDay }) => {
              const mine = message.sender_id === userId;
              const groupedWithPrevious = previous?.sender_id === message.sender_id && previousDay === day;
              const isIntroduction = introduction?.sender_id === message.sender_id && introduction.icebreaker === message.body;
              const quotedMessage = message.reply_to_message_id ? messageLookup.get(message.reply_to_message_id) ?? null : null;
              const surface = isIntroduction ? "border-[#dcc8a7] bg-[#fffaf1]" : mine ? "border-[#d1dccb] bg-[#e6ede2]" : "border-[#e4dfd7] bg-[#fffdfa]";
              return <div key={message.id}>
                {day !== previousDay && <div className="my-7 flex items-center gap-4 text-[10px] font-medium uppercase tracking-[.2em] text-black/35"><span className="h-px flex-1 bg-black/10" /><span>{day}</span><span className="h-px flex-1 bg-black/10" /></div>}
                <article id={`message-${message.id}`} className={`${groupedWithPrevious ? "mt-2" : "mt-6"} max-w-[84%] sm:max-w-[78%] ${mine ? "ml-auto text-right" : "mr-auto text-left"} ${activeSearchId === message.id ? "rounded-xl ring-2 ring-[#087456]/45 ring-offset-4 ring-offset-[#fbfaf6]" : ""}`}>
                  {isIntroduction && <p className={`mb-2 text-[10px] font-semibold uppercase tracking-[.18em] text-brand ${mine ? "text-right" : "text-left"}`}>{t("app.messages.introduction")}</p>}
                  <div role="button" tabIndex={0} aria-label={t("app.messages.replyToMessage")} onClick={() => { setReplyTo(message); window.requestAnimationFrame(() => composerRef.current?.focus()); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setReplyTo(message); window.requestAnimationFrame(() => composerRef.current?.focus()); } }} className={`inline-block cursor-pointer border px-4 py-3.5 text-left shadow-[0_1px_0_rgba(35,57,47,0.03)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#087456] sm:px-5 ${isIntroduction ? "rounded-xl" : "rounded-lg"} ${surface}`}>
                    {message.reply_to_message_id && <div className="mb-3 border-l-2 border-[#087456]/35 bg-black/[0.035] px-3 py-2 text-xs leading-5 text-black/55"><p className="font-medium text-brand">{quotedMessage?.sender_id === userId ? t("app.messages.you") : quotedMessage?.sender_id ? (otherName ?? t("app.messages.participant")) : t("app.messages.deletedUser")}</p><p className="line-clamp-2">{quotedMessage?.body ?? t("app.messages.originalUnavailable")}</p></div>}
                    <p className="whitespace-pre-wrap break-words text-[15px] leading-7 text-primary"><span className="sr-only">{mine ? t("app.messages.you") : (otherName ?? t("app.messages.participant"))}: </span>{appliedSearch ? highlightedText(message.body, appliedSearch) : message.body}</p>
                    {message.moderation_status === "flagged_for_review" && <p className="mt-2 text-[10px] font-semibold uppercase tracking-[.12em] text-black/45">{t("app.messages.flagged")}</p>}
                    <div className="mt-2 flex items-center justify-end gap-1 text-[10px] text-black/40"><time dateTime={message.created_at}>{new Date(message.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>{mine && <span aria-label={otherLastReadAt && Date.parse(otherLastReadAt) >= Date.parse(message.created_at) ? t("app.messages.readStatus") : t("app.messages.sentStatus")}>{otherLastReadAt && Date.parse(otherLastReadAt) >= Date.parse(message.created_at) ? "✓✓" : "✓"}</span>}</div>
                  </div>
                  <details onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.currentTarget.removeAttribute("open"); } }} className={`group relative mt-1 ${mine ? "text-right" : "text-left"}`}>
                    <summary className="inline-flex cursor-pointer list-none px-1 text-[16px] leading-none text-black/25 hover:text-black/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#087456]" aria-label={t("app.messages.messageActions")}>…</summary>
                    <div className={`absolute top-6 z-10 w-64 border border-black/10 bg-[#fffdfa] p-3 text-left shadow-lg ${mine ? "right-0" : "left-0"}`}>
                      <form action={submitReport} className="space-y-2"><input type="hidden" name="target_type" value="message" /><input type="hidden" name="target_id" value={message.id} /><input type="hidden" name="return_to" value={`/app/messages/${encodeURIComponent(conversationId)}`} /><label className="block text-xs font-medium text-black/60" htmlFor={`reason-${message.id}`}>{t("app.messages.reportThis")}</label><select id={`reason-${message.id}`} name="reason" className="field w-full text-xs"><option value="spam">{t("app.reports.spam")}</option><option value="scam/fraud">{t("app.reports.scam")}</option><option value="harassment">{t("app.reports.harassment")}</option><option value="sexual/inappropriate content">{t("app.reports.sexual")}</option><option value="hate/abuse">{t("app.reports.hate")}</option><option value="fake profile/impersonation">{t("app.reports.fake")}</option><option value="underage concern">{t("app.reports.underage")}</option><option value="other">{t("app.reports.other")}</option></select><input name="details" aria-label={t("app.reports.details")} className="field w-full text-xs" placeholder={t("app.messages.reportDetailsPlaceholder")} /><button className="w-full rounded-md border border-black/15 px-3 py-2 text-xs text-black/65 hover:bg-black/[0.04]">{t("app.reports.message")}</button></form>
                    </div>
                  </details>
                </article>
              </div>;
            })}
            {!historyLoadFailed && !liveMessages.length && <p className="border-y border-black/10 py-12 text-center text-sm leading-6 text-black/45">{t("app.messages.emptyThread")}</p>}
          </div>
        </div>
        {!nearBottom && showNew && <button type="button" onClick={jumpToLatest} className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-[#087456]/25 bg-[#f7f5ef] px-4 py-2 text-xs font-medium text-brand shadow-sm">{t("app.messages.newMessages")}</button>}
        {(selfTyping || otherTyping) && <div className="pointer-events-none absolute bottom-4 right-4 flex h-9 w-9 items-center justify-center rounded-full border border-[#087456]/20 bg-[#fffdfa] text-brand shadow-sm motion-safe:animate-bounce" role="status" aria-label={selfTyping ? t("app.messages.youAreTyping") : t("app.messages.otherTyping", { name: otherName ?? t("app.messages.otherPerson") })}><svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="m4.5 7 7.5 5 7.5-5"/></svg></div>}
      </div>
      <form id="message-composer" action={sendMessage} onSubmit={() => { try { window.sessionStorage.setItem(pendingDraftStorageKey, draft); if (replyTo) window.sessionStorage.setItem(pendingReplyStorageKey, JSON.stringify(replyTo)); else window.sessionStorage.removeItem(pendingReplyStorageKey); } catch {} }} className="border-t border-black/10 bg-[#fffdfa]/70 px-4 py-4 sm:px-5"><input type="hidden" name="conversation_id" value={conversationId} /><input type="hidden" name="reply_to_message_id" value={replyTo?.id ?? ""} />{replyTo && <div className="mb-3 flex items-start justify-between gap-3 rounded-md border border-black/10 bg-black/[0.025] px-3 py-2.5"><div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[.14em] text-brand">{t("app.messages.replyingTo", { name: replyTo.sender_id === userId ? t("app.messages.yourself") : (otherName ?? t("app.messages.participantLower")) })}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-black/55">{replyTo.body}</p></div><button type="button" onClick={() => setReplyTo(null)} className="shrink-0 px-1 text-sm text-black/40 hover:text-black/70" aria-label={t("app.messages.cancelReply")}>×</button></div>}<div className="flex items-end gap-3"><textarea ref={composerRef} name="body" value={draft} required rows={1} disabled={messageSendBlocked} onChange={(event) => { const value = event.target.value; setDraft(value); try { if (value) window.localStorage.setItem(draftStorageKey, value); else window.localStorage.removeItem(draftStorageKey); } catch {} noteTyping(value); }} onBlur={() => sendTyping(false)} onInput={resizeComposer} onKeyDown={handleKeyDown} className="field min-h-12 max-h-44 flex-1 resize-none rounded-lg bg-[#fffdfa] leading-7 disabled:cursor-not-allowed disabled:bg-black/[0.03] disabled:text-black/40" placeholder={messageSendBlocked ? (messageSendBlockedReason ? t("app.messages.messagingUnavailable") : t("app.messages.waitingForReply")) : t("app.messages.writeMessage")} aria-label={t("app.messages.message")} aria-describedby={messageSendBlocked ? "message-composer-status" : "message-composer-help"} /> <FormSubmitButton pendingLabel={t("app.messages.sending")} disabled={messageSendBlocked} className="btn-primary shrink-0 rounded-lg px-5">{t("app.messages.send")}</FormSubmitButton></div>{messageSendBlocked ? <p id="message-composer-status" className="mt-2 text-sm text-brand" role="status">{blockedReason}</p> : <p id="message-composer-help" className="mt-2 text-[11px] text-black/35">{t("app.messages.sendHint")}</p>}</form>
    </section>
  );
}
