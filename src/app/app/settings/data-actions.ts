"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getPageI18n } from "@/i18n/server";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

function createCleanupClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function cleanupAvatarDeletionOutbox(db: ServerClient, immediatePaths: string[]) {
  const service = createCleanupClient();
  if (service) {
    const { data: batch, error: claimError } = await service.rpc("claim_avatar_deletion_batch", { batch_size: 100 });
    const claimed = Array.isArray(batch) ? batch.filter((row): row is { id: string; path: string } => Boolean(row) && typeof row.id === "string" && typeof row.path === "string") : [];
    if (claimError || !claimed.length) return;

    const paths = claimed.map((row) => row.path);
    const { error: storageError } = await service.storage.from("avatars").remove(paths);
    if (storageError) {
      await service.rpc("fail_avatar_deletion_batch", {
        failed_ids: claimed.map((row) => row.id),
        cleanup_error: storageError.message,
      });
      return;
    }
    await service.rpc("complete_avatar_deletion_batch", { completed_ids: claimed.map((row) => row.id) });
    return;
  }

  // Local/dev installations may not have a service key. The deleted user's
  // still-authenticated server request can safely remove only the paths that
  // were captured before its own erasure; any failure remains queued for the
  // privileged worker to retry later.
  if (!immediatePaths.length) return;
  const { error: storageError } = await db.storage.from("avatars").remove(immediatePaths);
  if (!storageError) {
    await db.rpc("ack_my_avatar_deletions", { deletion_paths: immediatePaths });
  }
}

function settingsError(message: string): never {
  redirect(`/app/settings?error=${encodeURIComponent(message)}`);
}


export async function disconnectVerification(formData: FormData) {
  const { t } = await getPageI18n();
  const provider = String(formData.get("provider") ?? "").trim().toLowerCase();
  if (!provider) settingsError(t("server.settings.disconnectVerification"));
  const db = await createClient();
  const { data: claimsData } = await db.auth.getClaims();
  if (!claimsData?.claims?.sub) redirect("/sign-in");
  const { error } = await db.rpc("revoke_my_external_verification", { p_provider: provider });
  if (error) settingsError(t("server.settings.disconnectVerification"));
  redirect("/app/settings?verification=disconnected");
}

/** Disconnects Google Auth only when Supabase reports another identity remains. */
export async function disconnectGoogleLogin() {
  const { t } = await getPageI18n();
  const db = await createClient();
  const { data: userData, error: userError } = await db.auth.getUser();
  if (userError || !userData.user) redirect("/sign-in");
  const { data: identityData, error: identityError } = await db.auth.getUserIdentities();
  if (identityError) settingsError(t("server.settings.loginMethods"));
  const googleIdentity = identityData.identities.find((identity) => identity.provider === "google");
  if (!googleIdentity) redirect("/app/settings?login=disconnected");
  if (identityData.identities.length < 2) settingsError(t("server.settings.addLogin"));
  const { error: unlinkError } = await db.auth.unlinkIdentity(googleIdentity);
  if (unlinkError) settingsError(t("server.settings.disconnectGoogle"));
  redirect("/app/settings?login=disconnected");
}

export async function deleteAccount(formData: FormData) {
  const { t } = await getPageI18n();
  if (String(formData.get("confirmation") ?? "").trim() !== "DELETE") {
    settingsError(t("server.settings.deleteConfirm"));
  }

  const db = await createClient();
  const { data: claimsData } = await db.auth.getClaims();
  if (!claimsData?.claims?.sub) redirect("/sign-in");

  // Check the recent-authentication requirement before starting erasure. The
  // database function repeats this check as the final authorization boundary.
  const { data: userData, error: userError } = await db.auth.getUser();
  const lastSignInAt = userData.user?.last_sign_in_at;
  if (userError || !lastSignInAt || Date.now() - Date.parse(lastSignInAt) > 15 * 60 * 1000) {
    settingsError(t("server.settings.signInAgain"));
  }

  // Capture paths for best-effort post-commit cleanup. The deletion function
  // independently records them in the protected outbox before erasing data.
  const { data: paths } = await db.rpc("list_my_avatar_paths");
  const avatarPaths = Array.isArray(paths) ? paths.filter((path): path is string => typeof path === "string") : [];

  const { error: deleteError } = await db.rpc("delete_my_account");
  if (deleteError) settingsError(deleteError.message.includes("sign in") ? t("server.settings.signInAgain") : t("server.settings.deleteFailed"));
  await cleanupAvatarDeletionOutbox(db, avatarPaths);
  await db.auth.signOut();
  redirect("/");
}

export async function saveNotificationPreferences(formData: FormData) {
  const { t } = await getPageI18n();
  const db = await createClient();
  const { data: claimsData } = await db.auth.getClaims();
  if (!claimsData?.claims?.sub) redirect("/sign-in");
  const { error } = await db.rpc("save_my_notification_preferences", {
    p_introductions: formData.get("notify_introductions") === "on",
    p_photo_access: formData.get("notify_photo_access") === "on",
    p_support_updates: formData.get("notify_support") === "on",
    p_verification_reminders: formData.get("notify_verification") === "on",
    p_email_snail_mail: formData.get("email_snail_mail") === "on",
  });
  if (error) settingsError(t("server.settings.notificationSave"));
  redirect("/app/settings?notifications=saved#notifications");
}

export async function saveLoginMfaRequirement(formData: FormData) {
  const { t } = await getPageI18n();
  const db = await createClient();
  const { data: claimsData } = await db.auth.getClaims();
  if (!claimsData?.claims?.sub) redirect("/sign-in");
  const required = formData.get("require_login_mfa") === "on";
  const { error } = await db.rpc("save_my_login_mfa_requirement", { p_required: required });
  if (error) settingsError(error.message?.includes("authenticator") ? t("server.settings.mfaNeedsAuthenticator") : t("server.settings.mfaSave"));
  redirect(`/app/settings?mfa=${required ? "enabled" : "disabled"}#security`);
}

export async function changeAccountEmail(formData: FormData) {
  const { t } = await getPageI18n();
  const nextEmail = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail) || nextEmail.length > 254) settingsError(t("server.settings.emailValid"));
  const db = await createClient();
  const { data: userData, error: userError } = await db.auth.getUser();
  if (userError || !userData.user) redirect("/sign-in");
  if (userData.user.email?.toLowerCase() === nextEmail) redirect("/app/settings?email=same#account-identity");
  let redirectTo: string;
  try {
    const { emailConfirmationOrigin } = await import("@/lib/verification/server");
    const { headers } = await import("next/headers");
    redirectTo = `${emailConfirmationOrigin(await headers())}/auth/confirm`;
  } catch {
    settingsError(t("server.settings.emailChangeFailed"));
  }
  const { error } = await db.auth.updateUser({ email: nextEmail }, { emailRedirectTo: redirectTo! });
  if (error) settingsError(t("server.settings.emailChangeFailed"));
  redirect("/app/settings?email=pending#account-identity");
}
