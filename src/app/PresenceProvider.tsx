"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";

type PresenceInfo = { online: boolean; availability?: string | null; visible: boolean };
type PresenceContextValue = { watch: (userId: string) => void; unwatch: (userId: string) => void; online: (userId: string) => boolean; info: (userId: string) => PresenceInfo | undefined };
const PresenceContext = createContext<PresenceContextValue | null>(null);

type PresenceClient = ReturnType<typeof createClient>;
type PresenceChannel = ReturnType<PresenceClient["channel"]>;
const pendingRemovals = new WeakMap<PresenceClient, Map<string, Promise<unknown>>>();

function removePresenceChannel(client: PresenceClient, targetId: string, channel: PresenceChannel) {
  let removals = pendingRemovals.get(client);
  if (!removals) {
    removals = new Map();
    pendingRemovals.set(client, removals);
  }
  const removal = client.removeChannel(channel);
  removals.set(targetId, removal);
  void removal.finally(() => {
    if (removals.get(targetId) === removal) removals.delete(targetId);
  }).catch(() => console.warn("Could not close an activity status connection."));
}

export default function PresenceProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let active = true;

    const touchActivity = async () => {
      if (!active || document.visibilityState === "hidden") return;
      const { error } = await supabase.rpc("touch_activity");
      if (error && active) console.warn("Could not update activity timestamp.");
    };

    void touchActivity();

    const interval = window.setInterval(() => {
      void touchActivity();
    }, 5 * 60 * 1000);

    const onFocus = () => void touchActivity();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void touchActivity();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [supabase]);
  const channels = useRef(new Map<string, { channel: PresenceChannel | null; refs: number }>());
  const [presence, setPresence] = useState<Map<string, PresenceInfo>>(new Map());
  const ownSettingsRef = useRef({ availability: "available", show_activity_status: false, inactive_mode: true });
  useEffect(() => {
    let ownChannel: PresenceChannel | null = null;
    let active = true;
    const trackOwn = async () => {
      if (!active || ownSettingsRef.current.inactive_mode || !ownSettingsRef.current.show_activity_status || !ownChannel) return;
      await ownChannel.track({ online: true, availability: ownSettingsRef.current.availability, show_activity_status: true });
    };
    void (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!active) return;
      if (sessionData.session?.access_token) await supabase.realtime.setAuth(sessionData.session.access_token);
      if (!active) return;
      const { data: profile, error: profileError } = await supabase.from("profiles").select("availability,show_activity_status,inactive_mode").eq("id", userId).maybeSingle();
      if (!active) return;
      if (profileError) throw profileError;
      if (!profile) throw new Error("Presence settings unavailable");
      ownSettingsRef.current = { availability: profile.availability ?? "available", show_activity_status: profile.show_activity_status !== false, inactive_mode: profile.inactive_mode === true };
      // Supabase reuses channels by topic until asynchronous removal finishes.
      await pendingRemovals.get(supabase)?.get(userId);
      if (!active) return;
      ownChannel = supabase.channel(`presence:user:${userId}`, { config: { private: true, presence: { key: userId } } });
      ownChannel.subscribe(async (status) => { if (status === "SUBSCRIBED") await trackOwn(); });
    })().catch(() => { if (active) console.warn("Could not start an activity status connection."); });
    const onSettingsSubmit = (event: Event) => {
      if (!active) return;
      const form = event.target as HTMLFormElement | null;
      if (!form) return;
      const selected = form.elements.namedItem("availability") as RadioNodeList | null;
      const show = form.elements.namedItem("show_activity_status") as HTMLInputElement | null;
      const inactive = form.elements.namedItem("inactive_mode") as HTMLInputElement | null;
      if (!selected && !show && !inactive) return;
      ownSettingsRef.current = { availability: String(selected?.value ?? "available"), show_activity_status: show?.checked ?? false, inactive_mode: inactive?.checked ?? false };
      void (async () => {
        if (!active || !ownChannel) return;
        if (ownSettingsRef.current.inactive_mode || !ownSettingsRef.current.show_activity_status) {
          await ownChannel.untrack();
        } else {
          await ownChannel.untrack();
          await trackOwn();
        }
      })();
    };
    document.addEventListener("submit", onSettingsSubmit, true);
    return () => { active = false; document.removeEventListener("submit", onSettingsSubmit, true); if (ownChannel) removePresenceChannel(supabase, userId, ownChannel); };
  }, [supabase, userId]);
  const watch = useCallback((targetId: string) => {
    if (!targetId || targetId === userId) return;
    const existing = channels.current.get(targetId); if (existing) { existing.refs += 1; return; }
    const entry: { channel: PresenceChannel | null; refs: number } = { channel: null, refs: 1 };
    channels.current.set(targetId, entry);
    const isCurrent = () => channels.current.get(targetId) === entry;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!isCurrent()) return;
      if (data.session?.access_token) await supabase.realtime.setAuth(data.session.access_token);
      if (!isCurrent()) return;
      await pendingRemovals.get(supabase)?.get(targetId);
      if (!isCurrent()) return;
      const channel = supabase.channel(`presence:user:${targetId}`, { config: { private: true, presence: { key: targetId } } });
      entry.channel = channel;
      const update = () => {
        if (!isCurrent()) return;
        const state = channel.presenceState() as Record<string, Array<{ online?: boolean; availability?: string; show_activity_status?: boolean }>>;
        const metas = Object.values(state).flat(); const meta = metas[0];
        setPresence((current) => { const updated = new Map(current); if (meta) updated.set(targetId, { online: meta.online !== false, availability: meta.availability ?? null, visible: meta.show_activity_status !== false }); else updated.set(targetId, { online: false, availability: current.get(targetId)?.availability, visible: current.get(targetId)?.visible ?? true }); return updated; });
      };
      channel.on("presence", { event: "sync" }, update).on("presence", { event: "join" }, update).on("presence", { event: "leave" }, update);
      channel.subscribe();
    })().catch(() => { if (isCurrent()) console.warn("Could not start an activity status connection."); });
  }, [supabase, userId]);
  const unwatch = useCallback((targetId: string) => { const existing = channels.current.get(targetId); if (!existing) return; existing.refs -= 1; if (existing.refs > 0) return; channels.current.delete(targetId); setPresence((current) => { const next = new Map(current); next.delete(targetId); return next; }); if (existing.channel) removePresenceChannel(supabase, targetId, existing.channel); }, [supabase]);
  const reconnectTargets = useCallback(() => {
    const targets = [...channels.current.entries()].map(([id, entry]) => ({ id, refs: entry.refs }));
    for (const [id, { channel }] of channels.current) if (channel) removePresenceChannel(supabase, id, channel);
    channels.current.clear();
    setPresence(new Map());
    for (const target of targets) { for (let i = 0; i < target.refs; i += 1) watch(target.id); }
  }, [supabase, watch]);
  useEffect(() => { window.addEventListener("focus", reconnectTargets); document.addEventListener("visibilitychange", reconnectTargets); return () => { window.removeEventListener("focus", reconnectTargets); document.removeEventListener("visibilitychange", reconnectTargets); }; }, [reconnectTargets]);
  useEffect(() => () => { for (const [id, { channel }] of channels.current) if (channel) removePresenceChannel(supabase, id, channel); channels.current.clear(); }, [supabase]);
  const value = useMemo(() => ({ watch, unwatch, online: (id: string) => presence.get(id)?.online ?? false, info: (id: string) => presence.get(id) }), [presence, unwatch, watch]);
  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}

export function usePresence(userId: string, enabled = true) {
  const context = useContext(PresenceContext);
  const watch = context?.watch;
  const unwatch = context?.unwatch;
  useEffect(() => { if (!watch || !unwatch || !enabled || !userId) return; watch(userId); return () => unwatch(userId); }, [watch, unwatch, enabled, userId]);
  return context?.online(userId) ?? false;
}

export function PresenceStatus({ userId, fallback, visible = true, blocked = false, availability, awayLabel = "Away", onlineLabel = "Online now" }: { userId: string; fallback?: string | null; visible?: boolean; blocked?: boolean; availability?: string | null; awayLabel?: string; onlineLabel?: string }) {
  const isOnline = usePresence(userId, visible && !blocked);
  const context = useContext(PresenceContext);
  const live = context?.info(userId);
  if (!visible || blocked || live?.visible === false) return null;
  const currentAvailability = live?.availability ?? availability;
  const status = currentAvailability === "away" ? awayLabel : isOnline ? onlineLabel : fallback; if (!status) return null;
  return <span className="inline-flex items-center gap-2 text-emerald-700"><span className="h-2 w-2 rounded-full bg-[#27a875]" />{status}</span>;
}
