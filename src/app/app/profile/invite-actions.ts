"use server";

import { createClient } from "@/lib/supabase/server";
import { verificationSiteUrl } from "@/lib/verification/server";

export async function createMemberInvite() {
  const db = await createClient();
  const { data: claims } = await db.auth.getClaims();
  if (!claims?.claims?.sub) return { ok: false as const, error: "Sign in required." };
  const { data, error } = await db.rpc("create_member_invite");
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row?.invite_id || !row?.token || !row?.expires_at) {
    return { ok: false as const, error: error?.message?.includes("rate limit") || error?.message?.includes("active invitations") ? "You have created too many active invitations. Try again later." : "We couldn't create an invitation right now." };
  }
  return {
    ok: true as const,
    inviteId: String(row.invite_id),
    url: `${verificationSiteUrl()}/join/${encodeURIComponent(String(row.token))}`,
    expiresAt: String(row.expires_at),
  };
}

export async function revokeMemberInvite(inviteId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(inviteId)) return { ok: false as const };
  const db = await createClient();
  const { data: claims } = await db.auth.getClaims();
  if (!claims?.claims?.sub) return { ok: false as const };
  const { data, error } = await db.rpc("revoke_member_invite", { p_invite_id: inviteId });
  return { ok: !error && data === true };
}
