import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { createClient as createServerClient } from "@/lib/supabase/server";
import { isPrivateAvatarPath } from "@/lib/avatar";

type ServerClient = Awaited<ReturnType<typeof createServerClient>>;

export async function getAuthorizedProfilePhoto(
  db: ServerClient,
  ownerUser: string,
  viewerUser: string,
) {
  const permission = await db.rpc("can_view_profile_photo", {
    owner_user: ownerUser,
    viewer_user: viewerUser,
  });
  if (permission.error) return { allowed: false, url: null, error: true };
  if (!permission.data) return { allowed: false, url: null, error: false };

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!key || !url) return { allowed: true, url: null, error: true };

  const service = createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const profile = await service
    .from("profiles")
    .select("avatar_path")
    .eq("id", ownerUser)
    .maybeSingle();
  const avatarPath = profile.data?.avatar_path ?? null;
  if (profile.error || !avatarPath || !isPrivateAvatarPath(avatarPath, ownerUser)) {
    return { allowed: true, url: null, error: Boolean(profile.error) };
  }

  return { allowed: true, url: `/api/profile-photo/${encodeURIComponent(ownerUser)}`, error: false };
}
