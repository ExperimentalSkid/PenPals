import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await createClient();
  const { data: auth } = await db.auth.getClaims();
  if (!auth?.claims?.sub) return new NextResponse(null, { status: 401 });

  const permitted = await db.rpc("get_snail_mail_attachment_path", { attachment_uuid: id });
  const storagePath = typeof permitted.data === "string" ? permitted.data : null;
  if (permitted.error || !storagePath) return new NextResponse(null, { status: 404 });

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!key || !url) return new NextResponse(null, { status: 503 });

  const service = createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const downloaded = await service.storage.from("snail-mail-attachments").download(storagePath);
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
