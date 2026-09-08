"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function mysteryPath(message?: string) {
  return message
    ? `/app/discover/mystery?error=${encodeURIComponent(message)}`
    : "/app/discover/mystery";
}

export async function resolveMysteryPick(formData: FormData) {
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  if (!data?.claims?.sub) redirect("/sign-in");

  const token = String(formData.get("card_token") ?? "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(token)) {
    redirect(mysteryPath("That card is no longer available. Pick again."));
  }

  const { data: result, error } = await db.rpc("resolve_mystery_pick", { card_token: token });
  if (error) redirect(mysteryPath("That card slipped away. Pick another."));

  const resolved = result && typeof result === "object" && !Array.isArray(result)
    ? result as { status?: unknown; username?: unknown }
    : null;
  if (resolved?.status === "resolved" && typeof resolved.username === "string" && /^[a-z0-9_]{3,24}$/.test(resolved.username)) {
    redirect(`/app/profile/${encodeURIComponent(resolved.username)}?from=mystery-pick`);
  }
  redirect(mysteryPath("That card slipped away. Pick another."));
}

