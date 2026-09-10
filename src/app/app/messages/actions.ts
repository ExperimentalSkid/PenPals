"use server";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPageI18n } from "@/i18n/server";

export type IntroductionActionState = {
  status: "idle" | "error" | "quality";
  message?: string;
};

function isDeterministicQualityRejection(message: string) {
  return /gibberish|filler|repeated\s+characters|low[- ]quality|quality\s+rejection|not\s+(?:a\s+)?(?:genuine|meaningful)\s+introduction/i.test(message);
}

export async function startConversation(previousState: IntroductionActionState, formData: FormData): Promise<IntroductionActionState> {
  const { t } = await getPageI18n();
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
    return { status: "error", message: t("server.messages.introSendFailed") };
  }
  if (error) {
    const message = error.message ?? t("server.messages.introSendFailedShort");
    if (isDeterministicQualityRejection(message)) {
      return {
        status: "quality",
        message: t("server.messages.introQuality"),
      };
    }
    return { status: "error", message };
  }
  // Use the canonical app profile route so the success feedback survives the
  // handoff. The legacy /profile/[username] compatibility shim intentionally
  // redirects without forwarding query parameters.
  redirect(`/app/profile/${encodeURIComponent(username)}?message=${encodeURIComponent(t("server.messages.introSent"))}`);
}
export async function replyToIntroduction(formData: FormData) {
  const { t } = await getPageI18n();
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  if (!data?.claims?.sub) redirect("/sign-in");
  const { data: conversationId, error } = await db.rpc("reply_to_introduction", {
    introduction_id: String(formData.get("introduction_id")),
    reply: String(formData.get("reply") ?? ""),
  });
  if (error || !conversationId) redirect(`/app/introductions?error=${encodeURIComponent(t("server.messages.introOpenFailed"))}`);
  // The RPC clears the handled request's notification. Refresh the persistent
  // app shell as well as the destination so its count reflects that change.
  revalidatePath("/app", "layout");
  redirect(`/app/messages/${conversationId}`);
}
export async function declineIntroduction(formData: FormData) {
  const { t } = await getPageI18n();
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  if (!data?.claims?.sub) redirect("/sign-in");
  const { error } = await db.rpc("decline_introduction", { introduction_id: String(formData.get("introduction_id")) });
  if (error) redirect(`/app/introductions?error=${encodeURIComponent(t("server.messages.introDeclineFailed"))}`);
  revalidatePath("/app", "layout");
  redirect("/app/messages");
}
export async function sendMessage(formData: FormData) {
  const { t } = await getPageI18n();
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
    const message = error.message?.includes("Wait for a reply") ? t("server.messages.waitReply") : t("server.messages.messageFailed");
    redirect(`/app/messages/${conversationId}?error=${encodeURIComponent(message)}`);
  }
  redirect(`/app/messages/${conversationId}?sent=1`);
}
export async function markRead(conversationId: string) { const { t } = await getPageI18n(); const db = await createClient(); const { data } = await db.auth.getClaims(); if (!data?.claims?.sub) return { error: t("server.messages.readFailed") }; const { error } = await db.from("conversation_participants").update({ last_read_at: new Date().toISOString() }).eq("conversation_id", conversationId).eq("user_id", data.claims.sub); return error ? { error: "We couldn't update the conversation read state. Please refresh." } : { error: null }; }
export async function requestPhotoAccess(formData: FormData) {
  const { t } = await getPageI18n(); const db = await createClient(); const { data } = await db.auth.getClaims(); if (!data?.claims?.sub) redirect("/sign-in"); const conversationId = String(formData.get("conversation_id")); const ownerId = String(formData.get("owner_id")); const { error } = await db.rpc("request_photo_access", { owner_user: ownerId, conversation: conversationId }); if (error) redirect(`/app/messages/${conversationId}?error=${encodeURIComponent(t("server.messages.photoUnavailable"))}`); redirect(`/app/messages/${conversationId}?message=${encodeURIComponent(t("server.messages.photoRequested"))}`); }
export async function grantPhotoAccess(formData: FormData) {
  const { t } = await getPageI18n(); const db = await createClient(); const { data } = await db.auth.getClaims(); if (!data?.claims?.sub) redirect("/sign-in"); const conversationId = String(formData.get("conversation_id")); const viewerId = String(formData.get("viewer_id")); const { error } = await db.rpc("grant_photo_access", { viewer_user: viewerId, conversation: conversationId }); if (error) redirect(`/app/messages/${conversationId}?error=${encodeURIComponent(t("server.messages.photoUnavailable"))}`); redirect(`/app/messages/${conversationId}?message=${encodeURIComponent(t("server.messages.photoGranted"))}`); }
export async function respondPhotoAccess(formData: FormData) {
  const { t } = await getPageI18n(); const db = await createClient(); const { data } = await db.auth.getClaims(); if (!data?.claims?.sub) redirect("/sign-in"); const conversationId = String(formData.get("conversation_id")); const { error } = await db.rpc("respond_photo_access", { request_id: String(formData.get("request_id")), decision: String(formData.get("decision")) }); if (error) redirect(`/app/messages/${conversationId}?error=${encodeURIComponent(t("server.messages.photoUnavailable"))}`); redirect(`/app/messages/${conversationId}`); }
export async function revokePhotoAccess(formData: FormData) {
  const { t } = await getPageI18n(); const db = await createClient(); const { data } = await db.auth.getClaims(); if (!data?.claims?.sub) redirect("/sign-in"); const conversationId = String(formData.get("conversation_id")); const { error } = await db.rpc("revoke_photo_access", { viewer_user: String(formData.get("viewer_id")) }); if (error) redirect(`/app/messages/${conversationId}?error=${encodeURIComponent(t("server.messages.photoRevokeFailed"))}`); redirect(`/app/messages/${conversationId}`); }

export async function sendSnailMail(formData: FormData) {
  const { t } = await getPageI18n();
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
  if (error) { const message = error.message?.includes("Please wait before sending another letter") ? t("server.messages.letterWait") : t("server.messages.letterFailed"); redirect(`/app/messages/${conversationId}?error=${encodeURIComponent(message)}`); }
  redirect(`/app/messages/${conversationId}?message=${encodeURIComponent(t("server.messages.letterSent"))}`);
}

export async function markSnailMailRead(formData: FormData) {
  const { t } = await getPageI18n();
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  if (!data?.claims?.sub) redirect("/sign-in");
  const conversationId = String(formData.get("conversation_id"));
  const letterId = String(formData.get("letter_id"));
  const { error } = await db.rpc("mark_snail_mail_read", { letter_id: letterId });
  if (error) redirect(`/app/messages/${conversationId}?error=${encodeURIComponent(t("server.messages.letterUnavailable"))}`);
  redirect(`/app/messages/${conversationId}`);
}

export async function cancelSnailMail(formData: FormData) {
  const { t } = await getPageI18n();
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  if (!data?.claims?.sub) redirect("/sign-in");
  const conversationId = String(formData.get("conversation_id"));
  const letterId = String(formData.get("letter_id"));
  const { error } = await db.rpc("cancel_snail_mail", { letter_id: letterId });
  if (error) {
    redirect(`/app/messages/${conversationId}?error=${encodeURIComponent(t("server.messages.letterTransit"))}`);
  }
  redirect(`/app/messages/${conversationId}?message=${encodeURIComponent(t("server.messages.letterLost"))}`);
}
