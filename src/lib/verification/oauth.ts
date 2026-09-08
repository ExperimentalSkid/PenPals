import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import type { ExternalVerificationCapability } from "@/lib/verification/providers";

export class VerificationConfigurationError extends Error {
  readonly code = "configuration";
}

export class VerificationProviderError extends Error {
  readonly code = "provider";
}

export function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new VerificationConfigurationError(`Missing ${name}`);
  return value;
}

export function optionalEnv(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

export function randomToken(byteLength = 32): string {
  return randomBytes(byteLength).toString("base64url");
}

export function createCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function buildAuthorizationUrl(
  endpoint: string,
  params: Record<string, string | undefined>,
): string {
  const url = new URL(endpoint);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") url.searchParams.set(key, value);
  }
  return url.toString();
}

export async function readJsonResponse(response: Response, provider: string): Promise<Record<string, unknown>> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new VerificationProviderError(`${provider} returned an invalid response`);
  }
  if (!response.ok || !payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new VerificationProviderError(`${provider} authorization failed`);
  }
  return payload as Record<string, unknown>;
}

export async function postForm(
  endpoint: string,
  values: Record<string, string | undefined>,
  provider: string,
): Promise<Record<string, unknown>> {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) body.set(key, value);
  }
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body,
    cache: "no-store",
  });
  return readJsonResponse(response, provider);
}

export async function getJson(
  endpoint: string,
  headers: Record<string, string>,
  provider: string,
): Promise<Record<string, unknown>> {
  const response = await fetch(endpoint, { headers: { accept: "application/json", ...headers }, cache: "no-store" });
  return readJsonResponse(response, provider);
}

export function stringField(value: unknown, field: string, provider: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new VerificationProviderError(`${provider} did not return ${field}`);
  }
  return value.trim();
}

export function capabilityList(values: readonly ExternalVerificationCapability[]): ExternalVerificationCapability[] {
  return [...new Set(values)];
}

/**
 * Persist only a keyed fingerprint. The raw provider subject is never sent to
 * Supabase or returned to the browser. Every environment must configure a
 * dedicated secret so fingerprints remain stable across restarts and hosts.
 */
export function subjectFingerprint(provider: string, subject: string): string {
  const secret = process.env.VERIFICATION_SUBJECT_HMAC_SECRET?.trim();
  if (!secret) throw new VerificationConfigurationError("Missing VERIFICATION_SUBJECT_HMAC_SECRET");
  if (secret.length < 32) throw new VerificationConfigurationError("VERIFICATION_SUBJECT_HMAC_SECRET is too short");
  return createHmac("sha256", secret).update(`${provider}:${subject}`).digest("hex");
}

type OAuthState = {
  userId: string;
  provider: string;
  state: string;
  codeVerifier?: string;
  nonce?: string;
  redirectUri: string;
  issuedAt: number;
};

function stateSecret(): string {
  const configured = process.env.VERIFICATION_STATE_SECRET?.trim();
  if (!configured) throw new VerificationConfigurationError("Missing VERIFICATION_STATE_SECRET");
  if (configured.length < 32) throw new VerificationConfigurationError("VERIFICATION_STATE_SECRET is too short");
  return configured;
}

function signature(payload: string): string {
  return createHmac("sha256", stateSecret()).update(payload).digest("base64url");
}

export function encodeOAuthState(state: OAuthState): string {
  const payload = Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function decodeOAuthState(value: string | undefined): OAuthState | null {
  if (!value) return null;
  const [payload, suppliedSignature] = value.split(".");
  if (!payload || !suppliedSignature) return null;
  const expected = signature(payload);
  const suppliedBuffer = Buffer.from(suppliedSignature);
  const expectedBuffer = Buffer.from(expected);
  if (suppliedBuffer.length !== expectedBuffer.length || !timingSafeEqual(suppliedBuffer, expectedBuffer)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const candidate = parsed as Partial<OAuthState>;
  if (typeof candidate.userId !== "string" || typeof candidate.provider !== "string" || typeof candidate.state !== "string" || typeof candidate.redirectUri !== "string" || typeof candidate.issuedAt !== "number") return null;
  if (Date.now() - candidate.issuedAt > 10 * 60_000 || candidate.issuedAt > Date.now() + 60_000) return null;
  return candidate as OAuthState;
}

export type { OAuthState };
