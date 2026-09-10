"use server";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export type IntroductionActionState = {
  status: "idle" | "error" | "quality";
  message?: string;
};

function isDeterministicQualityRejection(message: string) {
  return /gibberish|filler|repeated\s+characters|low[- ]quality|quality\s+rejection|not\s+(?:a\s+)?(?:genuine|meaningful)\s+introduction/i.test(message);
}

export async function startConversation(previousState: IntroductionActionState, formData: FormData): Promise<IntroductionActionState> {
  void previousState;
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  if (!data?.claims?.sub) redirect("/sign-in");
  const username = String(formData.get("username"));
  let error: { message?: string | null } | null = null;
  try {
    ({ error } = await db.rpc("submit_introduction", {
      other_user: String(formData.get("user_id")),
      introduction: String(formData.get("introduction") ?? ""),
    }));
  } catch {
    return { status: "error", message: "We couldn't send that introduction. Please try again." };
  }
  if (error) {
    const message = error.message ?? "We couldn't send that introduction.";
    if (isDeterministicQualityRejection(message)) {
      return {
        status: "quality",
        message: "Write a genuine introduction. Mention something from their profile, something you have in common, or ask a real question. Repeated characters and filler text won’t be accepted.",
      };
    }
    return { status: "error", message };
  }
  // Use the canonical app profile route so the success feedback survives the
  // handoff. The legacy /profile/[username] compatibility shim intentionally
  // redirects without forwarding query parameters.
  redirect(`/app/profile/${encodeURIComponent(username)}?message=${encodeURIComponent("Introduction sent")}`);
}
export async function replyToIntroduction(formData: FormData) {
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  if (!data?.claims?.sub) redirect("/sign-in");
  const { data: conversationId, error } = await db.rpc("reply_to_introduction", {
    introduction_id: String(formData.get("introduction_id")),
    reply: String(formData.get("reply") ?? ""),
  });
  if (error || !conversationId) redirect(`/app/introductions?error=${encodeURIComponent("We couldn't open that introduction. Please refresh and try again.")}`);
  // The RPC clears the handled request's notification. Refresh the persistent
  // app shell as well as the destination so its count reflects that change.
  revalidatePath("/app", "layout");
  redirect(`/app/messages/${conversationId}`);
}
export async function declineIntroduction(formData: FormData) {
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  if (!data?.claims?.sub) redirect("/sign-in");
  const { error } = await db.rpc("decline_introduction", { introduction_id: String(formData.get("introduction_id")) });
  if (error) redirect(`/app/introductions?error=${encodeURIComponent("We couldn't decline that introduction. Please try again.")}`);
  revalidatePath("/app", "layout");
  redirect("/app/messages");
}
export async function sendMessage(formData: FormData) {
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  if (!data?.claims?.sub) redirect("/sign-in");
  const conversationId = String(formData.get("conversation_id"));
  const body = String(formData.get("body") ?? "").trim();
  const replyToMessageId = String(formData.get("reply_to_message_id") ?? "").trim() || null;
  if (!body) redirect(`/app/messages/${conversationId}`);
  // The message trigger maintains conversation activity atomically; there is
  // no second write that can fail after the message has already been sent.
  const { error } = await db.from("messages").insert({ conversation_id: conversationId, sender_id: data.claims.sub, body, reply_to_message_id: replyToMessageId });
  if (error) {
    const message = error.message?.includes("Wait for a reply") ? "Wait for a reply before sending another message." : "We couldn't send that message. Please try again.";
    redirect(`/app/messages/${conversationId}?error=${encodeURIComponent(message)}`);
  }
  redirect(`/app/messages/${conversationId}?sent=1`);
}
export async function markRead(conversationId: string) { const db = await createClient(); const { data } = await db.auth.getClaims(); if (!data?.claims?.sub) return { error: "We couldn't update the conversation read state. Please refresh." }; const { error } = await db.from("conversation_participants").update({ last_read_at: new Date().toISOString() }).eq("conversation_id", conversationId).eq("user_id", data.claims.sub); return error ? { error: "We couldn't update the conversation read state. Please refresh." } : { error: null }; }
export async function requestPhotoAccess(formData: FormData) { const db = await createClient(); const { data } = await db.auth.getClaims(); if (!data?.claims?.sub) redirect("/sign-in"); const conversationId = String(formData.get("conversation_id")); const ownerId = String(formData.get("owner_id")); const { error } = await db.rpc("request_photo_access", { owner_user: ownerId, conversation: conversationId }); if (error) redirect(`/app/messages/${conversationId}?error=${encodeURIComponent("Photo access isn't available right now. Please try again.")}`); redirect(`/app/messages/${conversationId}?message=Photo access requested`); }
export async function grantPhotoAccess(formData: FormData) { const db = await createClient(); const { data } = await db.auth.getClaims(); if (!data?.claims?.sub) redirect("/sign-in"); const conversationId = String(formData.get("conversation_id")); const viewerId = String(formData.get("viewer_id")); const { error } = await db.rpc("grant_photo_access", { viewer_user: viewerId, conversation: conversationId }); if (error) redirect(`/app/messages/${conversationId}?error=${encodeURIComponent("Photo access isn't available right now. Please try again.")}`); redirect(`/app/messages/${conversationId}?message=Photo access granted`); }
export async function respondPhotoAccess(formData: FormData) { const db = await createClient(); const { data } = await db.auth.getClaims(); if (!data?.claims?.sub) redirect("/sign-in"); const conversationId = String(formData.get("conversation_id")); const { error } = await db.rpc("respond_photo_access", { request_id: String(formData.get("request_id")), decision: String(formData.get("decision")) }); if (error) redirect(`/app/messages/${conversationId}?error=${encodeURIComponent("Photo access isn't available right now. Please try again.")}`); redirect(`/app/messages/${conversationId}`); }
export async function revokePhotoAccess(formData: FormData) { const db = await createClient(); const { data } = await db.auth.getClaims(); if (!data?.claims?.sub) redirect("/sign-in"); const conversationId = String(formData.get("conversation_id")); const { error } = await db.rpc("revoke_photo_access", { viewer_user: String(formData.get("viewer_id")) }); if (error) redirect(`/app/messages/${conversationId}?error=${encodeURIComponent("We couldn't revoke photo access. Please try again.")}`); redirect(`/app/messages/${conversationId}`); }

export async function sendSnailMail(formData: FormData) {
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  if (!data?.claims?.sub) redirect("/sign-in");
  const conversationId = String(formData.get("conversation_id"));
  const body = String(formData.get("body") ?? "");
  const idempotencyKey = String(formData.get("idempotency_key") ?? "").trim();
  const { error } = await db.rpc("send_snail_mail", {
    target_conversation: conversationId,
    letter_body: body,
    idempotency_key: idempotencyKey || null,
  });
  if (error) { const message = error.message?.includes("Please wait before sending another letter") ? "Please wait before sending another letter." : error.message || "We couldn't send that letter. Please try again."; redirect(`/app/messages/${conversationId}?error=${encodeURIComponent(message)}`); }
  redirect(`/app/messages/${conversationId}?message=Letter sent`);
}

export async function markSnailMailRead(formData: FormData) {
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  if (!data?.claims?.sub) redirect("/sign-in");
  const conversationId = String(formData.get("conversation_id"));
  const letterId = String(formData.get("letter_id"));
  const { error } = await db.rpc("mark_snail_mail_read", { letter_id: letterId });
  if (error) redirect(`/app/messages/${conversationId}?error=${encodeURIComponent(error.message || "That letter isn't available right now.")}`);
  redirect(`/app/messages/${conversationId}`);
}

export async function cancelSnailMail(formData: FormData) {
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  if (!data?.claims?.sub) redirect("/sign-in");
  const conversationId = String(formData.get("conversation_id"));
  const letterId = String(formData.get("letter_id"));
  const { error } = await db.rpc("cancel_snail_mail", { letter_id: letterId });
  if (error) {
    redirect(`/app/messages/${conversationId}?error=${encodeURIComponent("This letter is no longer in transit.")}`);
  }
  redirect(`/app/messages/${conversationId}?message=${encodeURIComponent("Letter lost in transit")}`);
}
