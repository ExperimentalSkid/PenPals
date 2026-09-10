import { createHmac, timingSafeEqual } from "node:crypto";

export const TERMS_VERSION = "2026-09-10";
export const PRIVACY_VERSION = "2026-09-10";
export const legalAcceptanceCookie = "penpal-signup-legal-acceptance";
export const legalAcceptanceMaxAge = 10 * 60;

function stateSecret() {
  const secret = process.env.GOOGLE_LOGIN_STATE_SECRET?.trim();
  if (!secret || secret.length < 32) throw new Error("Legal acceptance signing is not configured");
  return secret;
}

export function createLegalAcceptanceIntent(locale: "en" | "es") {
  const expiresAt = Date.now() + legalAcceptanceMaxAge * 1000;
  const payload = `${TERMS_VERSION}.${PRIVACY_VERSION}.${locale}.${expiresAt}`;
  const signature = createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyLegalAcceptanceIntent(value: string | undefined | null) {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 5) return null;
  const [termsVersion, privacyVersion, locale, expiresText, signature] = parts;
  const expiresAt = Number(expiresText);  if (termsVersion !== TERMS_VERSION || privacyVersion !== PRIVACY_VERSION || (locale !== "en" && locale !== "es") || !Number.isSafeInteger(expiresAt) || expiresAt <= Date.now() || !signature) return null;
  const payload = `${termsVersion}.${privacyVersion}.${locale}.${expiresAt}`;
  let expected: Buffer;
  let received: Buffer;
  try {
    expected = createHmac("sha256", stateSecret()).update(payload).digest();
    received = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  return { termsVersion, privacyVersion, locale };
}
