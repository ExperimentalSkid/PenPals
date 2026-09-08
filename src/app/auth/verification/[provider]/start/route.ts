import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encodeOAuthState, randomToken, VerificationConfigurationError } from "@/lib/verification/oauth";
import { getExternalVerificationProvider } from "@/lib/verification/registry";
import { createPkcePair, getEnabledVerificationPolicy, verificationCallbackUrl } from "@/lib/verification/server";

export const runtime = "nodejs";

const cookieName = (provider: string) => `penpal-verification-${provider}`;

function failure(request: NextRequest, reason = "unavailable") {
  return NextResponse.redirect(new URL(`/app/settings?verification=${reason}`, request.url));
}

export async function GET(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  const providerName = (await context.params).provider.toLowerCase();
  const adapter = getExternalVerificationProvider(providerName);
  if (!adapter) return failure(request);

  try {
    const db = await createClient();
    const { data: claimsData } = await db.auth.getClaims();
    const userId = claimsData?.claims?.sub;
    if (!userId) return NextResponse.redirect(new URL("/sign-in", request.url));
    const { data: userData } = await db.auth.getUser();
    if (!userData.user?.email_confirmed_at) return NextResponse.redirect(new URL("/check-email", request.url));

    const policy = await getEnabledVerificationPolicy(providerName);
    if (!policy || policy.accessTokenRetention !== "discard_after_verification") return failure(request, "unavailable");
    const scopes = policy.scopes.length ? policy.scopes : adapter.definition.minimumScopes;
    if (scopes.some((scope) => !adapter.definition.minimumScopes.includes(scope))) return failure(request, "unavailable");

    const redirectUri = verificationCallbackUrl(providerName);
    const state = randomToken(32);
    const nonce = providerName === "google" ? randomToken(32) : undefined;
    const pkce = adapter.definition.supportsPkce ? createPkcePair() : undefined;
    const oauthState = encodeOAuthState({
      userId,
      provider: providerName,
      state,
      codeVerifier: pkce?.verifier,
      nonce,
      redirectUri,
      issuedAt: Date.now(),
    });
    const url = await adapter.buildAuthorizationUrl({
      redirectUri,
      state,
      scopes,
      codeChallenge: pkce?.challenge,
      nonce,
    });
    const response = NextResponse.redirect(url);
    response.cookies.set(cookieName(providerName), oauthState, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: `/auth/verification/${providerName}`,
      maxAge: 10 * 60,
    });
    return response;
  } catch (error) {
    if (error instanceof VerificationConfigurationError) return failure(request, "unavailable");
    return failure(request, "failed");
  }
}
