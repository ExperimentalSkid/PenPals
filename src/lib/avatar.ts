const uuidSegment = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Only owner-scoped relative Storage paths are valid avatar references.
 * Legacy external URLs intentionally return false and must be re-uploaded.
 */
export function isPrivateAvatarPath(value: string | null | undefined, ownerId: string | null | undefined) {
  if (!value || !ownerId) return false;
  const path = value.trim();
  if (path !== value || !uuidSegment.test(ownerId) || !path.startsWith(`${ownerId}/`)) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(path) || /[\s?#]/.test(path) || path.includes("//")) return false;
  if (path.split("/").some((segment) => segment === "." || segment === "..")) return false;
  return path.length > ownerId.length + 1;
}

/**
 * Signed Supabase Storage URLs must be fetched directly so their short-lived
 * token is preserved. Legacy external avatar URLs are rejected before they
 * reach any image renderer.
 */
export function isSignedAvatarUrl(value: string | null | undefined) {
  if (!value) return false;
  try {
    return new URL(value).pathname.includes("/storage/v1/object/sign/avatars/");
  } catch {
    return false;
  }
}
