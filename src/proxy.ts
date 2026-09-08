import { type NextRequest } from "next/server";
import { updateSession } from "./lib/supabase/proxy";

/**
 * Next.js discovers Proxy next to the `app` directory.  This project keeps
 * the App Router under `src/app`, so the entry point must live under `src`
 * as well; the shared session/route guard remains in `lib/supabase/proxy`.
 */
export function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = { matcher: ["/app/:path*", "/auth/:path*"] };
