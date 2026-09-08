import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasCompletedProfile } from "@/lib/profile-completeness";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const withSessionCookies = (redirectResponse: NextResponse) => {
    // A refresh can happen during getClaims. Its replacement cookies must
    // survive onboarding/account redirects as well as successful requests.
    for (const cookie of response.cookies.getAll()) redirectResponse.cookies.set(cookie);
    return redirectResponse;
  };
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { cookies: { getAll: () => request.cookies.getAll(), setAll: (cookiesToSet) => { cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value)); response = NextResponse.next({ request }); cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options)); } } });
  const { data: claimsData } = await supabase.auth.getClaims(); const claims = claimsData?.claims;
  const appPath = request.nextUrl.pathname.startsWith("/app");
  if (appPath && !claims?.sub) return withSessionCookies(NextResponse.redirect(new URL("/sign-in", request.url)));
  if (claims?.sub && appPath) {
    // Keep the lifecycle read separate from the optional identity read. The
    // deactivation check must remain the first authoritative decision for
    // every app request, even when onboarding is bypassed for the bootstrap
    // account.
    const { data: lifecycleProfile, error: profileError } = await supabase.from("profiles").select("deactivated_at").eq("id", claims.sub).maybeSingle();
    if (profileError) return withSessionCookies(NextResponse.redirect(new URL("/sign-in?error=Account%20unavailable", request.url)));
    if (lifecycleProfile?.deactivated_at) return withSessionCookies(NextResponse.redirect(new URL("/reactivate", request.url)));
    // Profile setup is the only normal-user route available before onboarding
    // completes. The seeded bootstrap account (@admin) must retain access for
    // account recovery/testing even when its own profile is incomplete;
    // lifecycle and age gates above still apply. Other administrators follow
    // the normal completion boundary.
    const { data: profile, error: identityError } = await supabase
      .from("profiles")
      .select("username,role,deactivated_at")
      .eq("id", claims.sub)
      .maybeSingle();
    if (identityError) return withSessionCookies(NextResponse.redirect(new URL("/sign-in?error=Account%20unavailable", request.url)));
    // Re-check the lifecycle field on the combined identity projection so the
    // guard remains explicit even if the two reads observe different rows.
    if (profile?.deactivated_at) return withSessionCookies(NextResponse.redirect(new URL("/reactivate", request.url)));
    const isBootstrapAdmin = profile?.role === "admin" && profile?.username === "admin";
    if (request.nextUrl.pathname !== "/app/profile/setup" && !isBootstrapAdmin) {
      const [{ data: completionProfile, error: completionError }, { count: languageCount, error: languageError }, { count: interestCount, error: interestError }] = await Promise.all([
        supabase.from("profiles").select("username,display_name,birth_date,country").eq("id", claims.sub).maybeSingle(),
        supabase.from("profile_languages").select("language_id", { count: "exact", head: true }).eq("profile_id", claims.sub),
        supabase.from("profile_interests").select("interest_id", { count: "exact", head: true }).eq("profile_id", claims.sub),
      ]);
      if (completionError || languageError || interestError) return withSessionCookies(NextResponse.redirect(new URL("/sign-in?error=Account%20unavailable", request.url)));
      if (!completionProfile || !hasCompletedProfile(completionProfile, languageCount ?? 0, interestCount ?? 0)) {
        return withSessionCookies(NextResponse.redirect(new URL("/app/profile/setup", request.url)));
      }
    }
    if (Date.now() - Number(request.cookies.get("activity-ping")?.value ?? 0) > 5 * 60_000) { await supabase.rpc("touch_activity"); response.cookies.set("activity-ping", String(Date.now()), { maxAge: 600, httpOnly: true, sameSite: "lax", path: "/" }); }
  }
  return response;
}
