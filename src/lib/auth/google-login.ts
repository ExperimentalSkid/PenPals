import { createHmac, timingSafeEqual } from "node:crypto";
import { verificationSiteUrl } from "@/lib/verification/server";

export const googleLoginIntentCookie = "penpal-google-login-intent";
export const googleLoginIntentMaxAge = 10 * 60;

export class GoogleLoginConfigurationError extends Error {
  name = "GoogleLoginConfigurationError";
}

function stateSecret() {
  const secret = process.env.GOOGLE_LOGIN_STATE_SECRET?.trim();
  if (!secret) throw new GoogleLoginConfigurationError("Google login linking is not configured");
  if (secret.length < 32) throw new GoogleLoginConfigurationError("GOOGLE_LOGIN_STATE_SECRET is too short");
  return secret;
}

/**
 * The callback is deliberately different from the external-account
 * verification callback. Supabase Auth owns the OAuth state and PKCE verifier;
 * this signed intent only binds a Settings linking attempt to its original
 * Penpal user.
 */
export function googleLoginCallbackUrl(mode: "login" | "link" = "login", origin = verificationSiteUrl()) {
  const query = new URLSearchParams({ mode });
  return `${origin}/auth/callback?${query.toString()}`;
}

export function createGoogleLoginIntent(userId: string) {
  const expiresAt = Date.now() + googleLoginIntentMaxAge * 1000;
  const payload = `${userId}.${expiresAt}`;
  const signature = createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

/** Returns the intended Penpal user when the short-lived intent is authentic. */
export function verifyGoogleLoginIntent(value: string | undefined | null): string | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [userId, expiresText, signature] = parts;
  const expiresAt = Number(expiresText);
  if (!userId || !Number.isSafeInteger(expiresAt) || expiresAt <= Date.now() || !signature) return null;
  let expected: Buffer;
  try {
    expected = createHmac("sha256", stateSecret()).update(`${userId}.${expiresAt}`).digest();
  } catch {
    return null;
  }
  let received: Buffer;
  try {
    received = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  return userId;
}
