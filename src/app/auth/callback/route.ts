import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { googleLoginIntentCookie, verifyGoogleLoginIntent } from "@/lib/auth/google-login";
import { hasCompletedProfile } from "@/lib/profile-completeness";
import { verificationSiteUrl } from "@/lib/verification/server";
import { legalAcceptanceCookie, verifyLegalAcceptanceIntent } from "@/lib/auth/legal-acceptance";

export const runtime = "nodejs";

function safeNext(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || value.includes("\u0000") || (value !== "/app" && !value.startsWith("/app/"))) return "/app";
  return value;
}

function redirectOrigin(request: NextRequest) {
  const configuredOrigin = (() => {
    try {
      return verificationSiteUrl();
    } catch {
      return null;
    }
  })();
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host")?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProto || request.nextUrl.protocol.replace(":", "");
  if (host && (protocol === "http" || protocol === "https")) {
    try {
      const candidate = new URL(`${protocol}://${host}`).origin;
      const candidateUrl = new URL(candidate);
      const localAlias = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(candidateUrl.hostname)
        && candidateUrl.port === "3000";
      // When NEXT_PUBLIC_SITE_URL is configured (as it must be in production),
      // only that exact origin is trusted. Local aliases are accepted only for
      // the local setup where no canonical site origin is configured.
      if (candidate === configuredOrigin || (!configuredOrigin && localAlias)) return candidate;
    } catch {
      // Fall back to the configured origin below when the request host is malformed.
    }
  }
  return configuredOrigin || request.nextUrl.origin;
}

function destination(request: NextRequest, path: string, clearIntent = false) {
  const response = NextResponse.redirect(new URL(path, redirectOrigin(request)));
  if (clearIntent) {
    response.cookies.set(googleLoginIntentCookie, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/auth/callback",
      maxAge: 0,
    });
  }
  return response;
}

function failure(request: NextRequest, mode: "login" | "link", reason: "cancelled" | "error" | "invalid" = "error") {
  if (mode === "link") return destination(request, `/app/settings?login=${reason === "cancelled" ? "cancelled" : "error"}`, true);
  const message = reason === "cancelled" ? "Google sign-in was cancelled. Please try again." : "Google sign-in couldn't be completed. Please try again.";
  return destination(request, `/sign-in?error=${encodeURIComponent(message)}`);
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  const mode: "login" | "link" = query.get("mode") === "link" ? "link" : "login";
  const signupEntry = mode === "login" && query.get("entry") === "signup";
  const providerError = query.get("error");
  if (providerError) return failure(request, mode, "cancelled");

  // A link callback must carry the short-lived, signed intent created by the
  // authenticated Settings action. This prevents a forged query parameter from
  // turning an arbitrary OAuth callback into an account-link operation.
  const intendedUserId = mode === "link" ? verifyGoogleLoginIntent(request.cookies.get(googleLoginIntentCookie)?.value) : null;
  if (mode === "link" && !intendedUserId) return failure(request, mode, "invalid");

  const code = query.get("code");
  if (!code) return failure(request, mode, "invalid");

  let db: Awaited<ReturnType<typeof createClient>> | null = null;
  try {
    db = await createClient(request.headers.get("x-real-ip")?.trim() || null);
    const flowId = query.get("sb_flow_id");
    const { error: exchangeError } = await db.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
    if (exchangeError) return failure(request, mode, "invalid");

    const { data: userData, error: userError } = await db.auth.getUser();
    const user = userData.user;
    if (userError || !user) {
      await db.auth.signOut();
      return failure(request, mode);
    }
    if (!user.email_confirmed_at) {
      await db.auth.signOut();
      return destination(request, "/check-email", mode === "link");
    }

    if (signupEntry) {
      const legalIntent = verifyLegalAcceptanceIntent(request.cookies.get(legalAcceptanceCookie)?.value);
      if (!legalIntent) {
        await db.auth.signOut();
        return destination(request, "/sign-up?legal=required");
      }
      const { error: legalError } = await db.rpc("record_my_google_signup_legal_acceptance", {
        p_terms_version: legalIntent.termsVersion,
        p_privacy_version: legalIntent.privacyVersion,
        p_locale: legalIntent.locale,
      });
      if (legalError) {
        await db.auth.signOut();
        return destination(request, "/sign-up?legal=required");
      }
    }

    const { data: ageRestricted, error: ageError } = await db.rpc("is_current_user_age_restricted");
    if (ageError) {
      await db.auth.signOut();
      return failure(request, mode);
    }
    if (ageRestricted) return destination(request, "/age-appeal", mode === "link");

    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("username,display_name,birth_date,gender,country,city,region_code,location_precision,bio,quote,looking_for,avatar_path,deactivated_at,role")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) {
      await db.auth.signOut();
      return failure(request, mode);
    }
    if (profile?.deactivated_at) return destination(request, "/reactivate", mode === "link");

    if (mode === "link") {
      if (!intendedUserId || intendedUserId !== user.id) {
        await db.auth.signOut();
        return failure(request, mode, "invalid");
      }
      return destination(request, "/app/settings?login=connected", true);
    }

    // Administrators need to reach the staff workspace for account recovery
    // and testing even when their own profile is incomplete. Keep the normal
    // age, email, deactivation, and authentication gates above unchanged.
    if (profile?.role === "admin" && profile.username === "admin") return destination(request, safeNext(query.get("next")));

    // A first-time Google Auth user has no profile yet. The existing setup action
    // collects the DOB and runs the same server-side 18+ gate as email signup.
    if (!profile) return destination(request, "/app/profile/setup");
    // Do not treat a partially saved/legacy row as onboarding complete.
    // Counts are read server-side so a client cannot skip required setup fields.
    const [{ count: languageCount, error: languageError }, { count: interestCount, error: interestError }] = await Promise.all([
      db.from("profile_languages").select("language_id", { count: "exact", head: true }).eq("profile_id", user.id),
      db.from("profile_interests").select("interest_id", { count: "exact", head: true }).eq("profile_id", user.id),
    ]);
    if (languageError || interestError) {
      await db.auth.signOut();
      return failure(request, mode);
    }
    if (!hasCompletedProfile(profile, languageCount ?? 0, interestCount ?? 0)) return destination(request, "/app/profile/setup");
    return destination(request, safeNext(query.get("next")));
  } catch {
    if (db) {
      try {
        await db.auth.signOut();
      } catch {
        // Keep callback failures generic even if the cleanup request fails.
      }
    }
    return failure(request, mode);
  }
}
