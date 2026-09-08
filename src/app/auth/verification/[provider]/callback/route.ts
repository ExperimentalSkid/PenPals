import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decodeOAuthState, VerificationConfigurationError } from "@/lib/verification/oauth";
import { getExternalVerificationProvider } from "@/lib/verification/registry";
import { createVerificationServiceClient, verificationCallbackUrl, verificationResultPath } from "@/lib/verification/server";

export const runtime = "nodejs";

const cookieName = (provider: string) => `penpal-verification-${provider}`;

function failure(request: NextRequest, reason = "failed") {
  return NextResponse.redirect(new URL(`/app/settings?verification=${reason}`, request.url));
}

export async function GET(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  const providerName = (await context.params).provider.toLowerCase();
  const adapter = getExternalVerificationProvider(providerName);
  if (!adapter) return failure(request);

  const providerCookie = request.cookies.get(cookieName(providerName))?.value;
  let oauthState;
  try {
    oauthState = decodeOAuthState(providerCookie);
  } catch (error) {
    if (error instanceof VerificationConfigurationError) return failure(request, "unavailable");
    return failure(request);
  }
  if (!oauthState || oauthState.provider !== providerName) return failure(request, "invalid-callback");

  const query = request.nextUrl.searchParams;
  if (query.get("error")) return failure(request, "cancelled");
  const state = query.get("state");
  const code = query.get("code");
  if (!state || !code || state !== oauthState.state) return failure(request, "invalid-callback");

  try {
    const db = await createClient();
    const { data: claimsData } = await db.auth.getClaims();
    const userId = claimsData?.claims?.sub;
    if (!userId) return NextResponse.redirect(new URL("/sign-in", request.url));
    const { data: userData } = await db.auth.getUser();
    if (!userData.user?.email_confirmed_at || userId !== oauthState.userId) return NextResponse.redirect(new URL("/check-email", request.url));

    const expectedRedirectUri = verificationCallbackUrl(providerName);
    if (oauthState.redirectUri !== expectedRedirectUri) return failure(request, "invalid-callback");
    const result = await adapter.exchangeAuthorizationCode({
      code,
      redirectUri: expectedRedirectUri,
      codeVerifier: oauthState.codeVerifier,
      nonce: oauthState.nonce,
    });
    // The foundation intentionally has no token columns. A provider adapter
    // must never ask this route to persist token material.
    if (result.accessTokenDisposition !== "discard_after_verification") return failure(request, "unavailable");

    const service = createVerificationServiceClient();
    const { data: persisted, error } = await service.rpc("record_external_verification", {
      p_penpal_user_id: userId,
      p_provider: providerName,
      p_provider_subject_fingerprint: result.providerSubjectFingerprint,
      p_capabilities: result.capabilities,
      p_provider_account_created_at: result.providerAccountCreatedAt ?? null,
    });
    if (error) {
      if (/already linked/i.test(error.message ?? "")) {
        // The failed persistence transaction rolls back its own writes. Record
        // identity reuse in a separate service transaction without exposing
        // the conflicting account to the requester.
        await service.rpc("record_external_verification_conflict", {
          p_penpal_user_id: userId,
          p_provider: providerName,
          p_provider_subject_fingerprint: result.providerSubjectFingerprint,
        });
      }
      return failure(request, "unavailable");
    }
    const status = persisted && typeof persisted === "object" && !Array.isArray(persisted) && typeof (persisted as { status?: unknown }).status === "string"
      ? (persisted as { status: string }).status
      : "linked_not_eligible";
    const response = NextResponse.redirect(new URL(verificationResultPath(status), request.url));
    response.cookies.set(cookieName(providerName), "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: `/auth/verification/${providerName}`,
      maxAge: 0,
    });
    return response;
  } catch (error) {
    if (error instanceof VerificationConfigurationError) return failure(request, "unavailable");
    return failure(request);
  }
}
