import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isPrivateAvatarPath } from "@/lib/avatar";

type InboxIdentity = {
  id: string;
  username: string | null;
  display_name: string | null;
  age: number | null;
  avatar_path: string | null;
};

// Create once per inbox render, never globally: these projections and signed
// photos depend on the current viewer. Cache in-flight reads as well as results
// so multiple conversations/letters from one person share the same checks.
export function createInboxProfileLoader(db: SupabaseClient, viewerId: string) {
  const identities = new Map<string, Promise<InboxIdentity | null>>();
  const origins = new Map<string, Promise<string | null>>();
  const photos = new Map<string, Promise<string | null>>();

  function identity(userId: string) {
    if (!identities.has(userId)) {
      identities.set(userId, (async () => {
        const result = await db.rpc("resolve_profile_identity", { target_user: userId });
        return (Array.isArray(result.data) ? result.data[0] : result.data) ?? null;
      })());
    }
    return identities.get(userId)!;
  }

  function origin(userId: string) {
    if (!origins.has(userId)) {
      origins.set(userId, (async () => {
        const person = await identity(userId);
        if (!person?.username) return null;
        const result = await db.rpc("get_public_profile", { target_username: person.username });
        const publicProfile = result.data;
        return typeof publicProfile?.location_label === "string" && publicProfile.location_label.trim()
          ? publicProfile.location_label.trim()
          : typeof publicProfile?.country === "string" && publicProfile.country.trim()
            ? publicProfile.country.trim()
            : null;
      })());
    }
    return origins.get(userId)!;
  }

  function photo(userId: string) {
    if (!photos.has(userId)) {
      photos.set(userId, (async () => {
        const person = await identity(userId);
        if (!person?.username) return null;
        const { data: canView } = await db.rpc("can_view_profile_photo", { owner_user: person.id, viewer_user: viewerId });
        if (!canView) return null;
        const path = person.avatar_path;
        if (!path || !isPrivateAvatarPath(path, person.id)) return null;
        return (await db.storage.from("avatars").createSignedUrl(path, 3600)).data?.signedUrl ?? null;
      })());
    }
    return photos.get(userId)!;
  }

  return { identity, origin, photo };
}
