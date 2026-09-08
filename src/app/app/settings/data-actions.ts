"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

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
  const provider = String(formData.get("provider") ?? "").trim().toLowerCase();
  if (!provider) settingsError("We couldn't disconnect verification.");
  const db = await createClient();
  const { data: claimsData } = await db.auth.getClaims();
  if (!claimsData?.claims?.sub) redirect("/sign-in");
  const { error } = await db.rpc("revoke_my_external_verification", { p_provider: provider });
  if (error) settingsError("We couldn't disconnect verification.");
  redirect("/app/settings?verification=disconnected");
}

/** Disconnects Google Auth only when Supabase reports another identity remains. */
export async function disconnectGoogleLogin() {
  const db = await createClient();
  const { data: userData, error: userError } = await db.auth.getUser();
  if (userError || !userData.user) redirect("/sign-in");
  const { data: identityData, error: identityError } = await db.auth.getUserIdentities();
  if (identityError) settingsError("We couldn't load your login methods.");
  const googleIdentity = identityData.identities.find((identity) => identity.provider === "google");
  if (!googleIdentity) redirect("/app/settings?login=disconnected");
  if (identityData.identities.length < 2) settingsError("Add another login method before disconnecting Google.");
  const { error: unlinkError } = await db.auth.unlinkIdentity(googleIdentity);
  if (unlinkError) settingsError("We couldn't disconnect Google right now.");
  redirect("/app/settings?login=disconnected");
}

export async function deleteAccount(formData: FormData) {
  if (String(formData.get("confirmation") ?? "").trim() !== "DELETE") {
    settingsError("Type DELETE to confirm permanent account deletion.");
  }

  const db = await createClient();
  const { data: claimsData } = await db.auth.getClaims();
  if (!claimsData?.claims?.sub) redirect("/sign-in");

  // Check the recent-authentication requirement before starting erasure. The
  // database function repeats this check as the final authorization boundary.
  const { data: userData, error: userError } = await db.auth.getUser();
  const lastSignInAt = userData.user?.last_sign_in_at;
  if (userError || !lastSignInAt || Date.now() - Date.parse(lastSignInAt) > 15 * 60 * 1000) {
    settingsError("Please sign in again before deleting your account.");
  }

  // Capture paths for best-effort post-commit cleanup. The deletion function
  // independently records them in the protected outbox before erasing data.
  const { data: paths } = await db.rpc("list_my_avatar_paths");
  const avatarPaths = Array.isArray(paths) ? paths.filter((path): path is string => typeof path === "string") : [];

  const { error: deleteError } = await db.rpc("delete_my_account");
  if (deleteError) settingsError(deleteError.message.includes("sign in") ? "Please sign in again before deleting your account." : "We couldn't delete your account.");
  await cleanupAvatarDeletionOutbox(db, avatarPaths);
  await db.auth.signOut();
  redirect("/");
}
