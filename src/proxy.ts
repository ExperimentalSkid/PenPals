import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "./lib/supabase/proxy";

const localizedPublicRoots = new Set(["/", "/faq", "/privacy", "/terms", "/guidelines", "/contact"]);
const localizedPublicPrefixes = ["/country/", "/language/", "/interest/"];

function isLocalizedPublicPath(pathname: string) {
  return localizedPublicRoots.has(pathname) || localizedPublicPrefixes.some((prefix) => pathname.startsWith(prefix));
}

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (pathname === "/es" || pathname.startsWith("/es/")) {
    const stripped = pathname === "/es" ? "/" : pathname.slice(3);
    if (!isLocalizedPublicPath(stripped)) return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = stripped;
    // The public reverse proxy forwards HTTPS while Next itself listens on HTTP locally.
    // Keep this as an internal rewrite instead of proxying TLS back into port 3000.
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") url.protocol = "http:";
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-penpals-locale", "es");
    return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  }
  if (isLocalizedPublicPath(pathname)) {
    // Requests internally rewritten from /es/* already carry the Spanish
    // locale marker. Do not redirect those back to /es/* again or the
    // rewrite re-enters this branch and creates a redirect loop.
    if (request.headers.get("x-penpals-locale") === "es") return NextResponse.next();
    if (request.cookies.get("NEXT_LOCALE")?.value === "es") {
      const url = request.nextUrl.clone();
      url.pathname = pathname === "/" ? "/es" : `/es${pathname}`;
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }
  return updateSession(request);
}

export const config = { matcher: ["/", "/faq", "/privacy", "/terms", "/guidelines", "/contact", "/country/:path*", "/language/:path*", "/interest/:path*", "/es/:path*", "/app/:path*", "/auth/:path*"] };
