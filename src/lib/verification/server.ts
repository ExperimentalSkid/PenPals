import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { createCodeChallenge, VerificationConfigurationError } from "@/lib/verification/oauth";

export function verificationSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    let url: URL;
    try {
      url = new URL(configured);
    } catch {
      throw new VerificationConfigurationError("Invalid site URL");
    }
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new VerificationConfigurationError("Invalid site URL");
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new VerificationConfigurationError("Invalid site URL protocol");
    if (process.env.NODE_ENV === "production" && url.protocol !== "https:") throw new VerificationConfigurationError("Production site URL must use HTTPS");
    if (process.env.NODE_ENV === "production" && ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname)) throw new VerificationConfigurationError("Production site URL must not point to localhost");
    return url.origin;
  }
  if (process.env.NODE_ENV === "production") throw new VerificationConfigurationError("Missing NEXT_PUBLIC_SITE_URL");
  return "http://localhost:3000";
}

export function verificationCallbackUrl(provider: string): string {
  return `${verificationSiteUrl()}/auth/verification/${encodeURIComponent(provider)}/callback`;
}

/** Preserve the local origin that owns the PKCE verifier cookie. Production
 * email links always use the configured HTTPS origin, never request headers. */
export function emailConfirmationOrigin(requestHeaders: Pick<Headers, "get">): string {
  const configured = verificationSiteUrl();
  if (process.env.NODE_ENV === "production" || configured !== "http://localhost:3000") return configured;
  try {
    const origin = requestHeaders.get("origin");
    if (!origin) return configured;
    const candidate = new URL(origin);
    if (candidate.protocol === "http:" && candidate.port === "3000"
      && ["localhost", "127.0.0.1", "[::1]"].includes(candidate.hostname)
      && !candidate.username && !candidate.password && candidate.pathname === "/" && !candidate.search && !candidate.hash) {
      return candidate.origin;
    }
  } catch { /* Retain the configured origin for malformed/missing headers. */ }
  return configured;
}

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll("-", "");
  return { verifier, challenge: createCodeChallenge(verifier) };
}

export function createVerificationServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) throw new VerificationConfigurationError("Verification service is not configured");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url) throw new VerificationConfigurationError("Verification service is not configured");
  return createSupabaseClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function getEnabledVerificationPolicy(provider: string) {
  const service = createVerificationServiceClient();
  const { data, error } = await service
    .from("external_verification_provider_policies")
    .select("enabled,minimum_oauth_scopes,access_token_retention")
    .eq("provider", provider)
    .maybeSingle();
  if (error || !data?.enabled) return null;
  return {
    scopes: Array.isArray(data.minimum_oauth_scopes)
      ? data.minimum_oauth_scopes.filter((scope): scope is string => typeof scope === "string")
      : [],
    accessTokenRetention: data.access_token_retention === "retain_for_reverification"
      ? "retain_for_reverification"
      : "discard_after_verification",
  } as const;
}

export function verificationResultPath(status: string): string {
  if (status === "verified") return "/app/settings?verification=verified";
  if (status === "linked_not_eligible") return "/app/settings?verification=not-eligible";
  return "/app/settings?verification=unavailable";
}
