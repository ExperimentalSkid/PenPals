"use client";

import { useMemo, useState } from "react";
import { createMemberInvite, revokeMemberInvite } from "./invite-actions";

type ExistingInvite = { id?: unknown; created_at?: unknown; expires_at?: unknown; opened_at?: unknown; registered_at?: unknown; revoked_at?: unknown };
type ActiveInvite = { id: string; createdAt: string; expiresAt: string; openedAt: string | null };
type Labels = { title: string; body: string; create: string; creating: string; copy: string; copied: string; revoke: string; revoked: string; expires: string; active: string; opened: string; unopened: string; error: string };

function parseActiveInvites(rows: unknown[]): ActiveInvite[] {
  const now = Date.now();
  return rows.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const row = value as ExistingInvite;
    if (typeof row.id !== "string" || typeof row.created_at !== "string" || typeof row.expires_at !== "string" || row.registered_at || row.revoked_at) return [];
    const expiry = Date.parse(row.expires_at);
    if (!Number.isFinite(expiry) || expiry <= now) return [];
    return [{ id: row.id, createdAt: row.created_at, expiresAt: row.expires_at, openedAt: typeof row.opened_at === "string" ? row.opened_at : null }];
  });
}

export default function InviteMember({ labels, existingInvites = [] }: { labels: Labels; existingInvites?: unknown[] }) {
  const initialActive = useMemo(() => parseActiveInvites(existingInvites), [existingInvites]);
  const [activeInvites, setActiveInvites] = useState(initialActive);
  const [state, setState] = useState<{ inviteId: string; url: string; expiresAt: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [revoked, setRevoked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createInvite() {
    setPending(true); setError(null); setCopied(false); setRevoked(false);
    const result = await createMemberInvite();
    setPending(false);
    if (!result.ok) { setError(result.error || labels.error); return; }
    setState({ inviteId: result.inviteId, url: result.url, expiresAt: result.expiresAt });
    setActiveInvites((current) => [{ id: result.inviteId, createdAt: new Date().toISOString(), expiresAt: result.expiresAt, openedAt: null }, ...current]);
  }

  async function copyInvite() {
    if (!state) return;
    await navigator.clipboard.writeText(state.url);
    setCopied(true);
  }

  async function revokeInvite(inviteId: string) {
    const result = await revokeMemberInvite(inviteId);
    if (!result.ok) { setError(labels.error); return; }
    setActiveInvites((current) => current.filter((invite) => invite.id !== inviteId));
    if (state?.inviteId === inviteId) { setState(null); setRevoked(true); }
  }

  return <section className="mt-4 rounded-xl border border-[#d9cdb9] bg-[#fbfaf6] p-4 text-left">
    <p className="text-sm font-semibold text-primary">{labels.title}</p>
    <p className="mt-1 text-xs leading-5 text-black/55">{labels.body}</p>
    <button type="button" onClick={createInvite} disabled={pending} className="mt-3 w-full rounded-md border border-[#087456] px-3 py-2 text-sm font-medium text-brand transition hover:bg-[#e7eee8] disabled:opacity-60">{pending ? labels.creating : labels.create}</button>
    {state && <div className="mt-3 space-y-2 rounded-lg border border-black/10 bg-white/60 p-3">
      <input readOnly value={state.url} aria-label={labels.copy} className="field w-full text-xs" />
      <p className="text-[11px] text-black/45">{labels.expires.replace("{date}", new Date(state.expiresAt).toLocaleDateString())}</p>
      <button type="button" onClick={copyInvite} className="rounded-md border border-[#087456] px-3 py-2 text-xs font-medium text-brand">{copied ? labels.copied : labels.copy}</button>
    </div>}
    {activeInvites.length > 0 && <div className="mt-4 border-t border-black/10 pt-3">
      <p className="text-xs font-semibold text-primary">{labels.active}</p>
      <div className="mt-2 space-y-2">{activeInvites.map((invite) => <div key={invite.id} className="flex items-center justify-between gap-3 rounded-md bg-white/50 px-3 py-2 text-[11px] text-black/55"><span>{invite.openedAt ? labels.opened : labels.unopened} · {labels.expires.replace("{date}", new Date(invite.expiresAt).toLocaleDateString())}</span><button type="button" onClick={() => revokeInvite(invite.id)} className="font-medium text-red-700 hover:underline">{labels.revoke}</button></div>)}</div>
    </div>}
    {revoked && <p className="mt-3 text-xs font-medium text-black/55">{labels.revoked}</p>}
    {error && <p role="alert" className="mt-3 text-xs text-red-700">{error}</p>}
  </section>;
}
