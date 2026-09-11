import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isPrivateAvatarPath } from "@/lib/avatar";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: ownerUser } = await params;
  const db = await createClient();
  const { data: auth } = await db.auth.getClaims();
  const viewerUser = auth?.claims?.sub;
  if (!viewerUser) return new NextResponse(null, { status: 401 });

  const permission = await db.rpc("can_view_profile_photo", {
    owner_user: ownerUser,
    viewer_user: viewerUser,
  });
  if (permission.error || !permission.data) return new NextResponse(null, { status: 404 });

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!key || !url) return new NextResponse(null, { status: 503 });

  const service = createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const profile = await service.from("profiles").select("avatar_path").eq("id", ownerUser).maybeSingle();
  const avatarPath = profile.data?.avatar_path ?? null;
  if (profile.error || !avatarPath || !isPrivateAvatarPath(avatarPath, ownerUser)) {
    return new NextResponse(null, { status: 404 });
  }

  const downloaded = await service.storage.from("avatars").download(avatarPath);
  if (downloaded.error || !downloaded.data) return new NextResponse(null, { status: 404 });

  return new NextResponse(downloaded.data, {
    status: 200,
    headers: {
      "Content-Type": downloaded.data.type || "application/octet-stream",
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
