import { createPublicKey, createVerify } from "node:crypto";

import type {
  ExternalVerificationAdapter,
  ExternalVerificationExchangeResult,
  ExternalVerificationAuthorizationRequest,
} from "@/lib/verification/providers";
import {
  buildAuthorizationUrl,
  capabilityList,
  getJson,
  postForm,
  requiredEnv,
  stringField,
  subjectFingerprint,
  VerificationProviderError,
} from "@/lib/verification/oauth";

const capabilities = ["ownership", "stable_account_identifier"] as const;
const authorizationEndpoint = "https://accounts.google.com/o/oauth2/v2/auth";
const tokenEndpoint = "https://oauth2.googleapis.com/token";
const jwksEndpoint = "https://www.googleapis.com/oauth2/v3/certs";

function clientId() {
  return requiredEnv("GOOGLE_VERIFICATION_CLIENT_ID");
}

function clientSecret() {
  return requiredEnv("GOOGLE_VERIFICATION_CLIENT_SECRET");
}

function authorization(request: ExternalVerificationAuthorizationRequest): string {
  return buildAuthorizationUrl(authorizationEndpoint, {
    client_id: clientId(),
    redirect_uri: request.redirectUri,
    response_type: "code",
    scope: request.scopes.join(" "),
    state: request.state,
    code_challenge: request.codeChallenge,
    code_challenge_method: request.codeChallenge ? "S256" : undefined,
    nonce: request.nonce,
    access_type: "online",
    prompt: "consent",
  });
}

async function exchange(input: { code: string; redirectUri: string; codeVerifier?: string; nonce?: string }): Promise<ExternalVerificationExchangeResult> {
  const id = clientId();
  const token = await postForm(tokenEndpoint, {
    code: input.code,
    client_id: id,
    client_secret: clientSecret(),
    redirect_uri: input.redirectUri,
    grant_type: "authorization_code",
    code_verifier: input.codeVerifier,
  }, "Google");
  const idToken = stringField(token.id_token, "id_token", "Google");
  const claims = await verifyIdToken(idToken, input.nonce, id);
  const issuer = stringField(claims.iss, "issuer", "Google");
  if (issuer !== "https://accounts.google.com" && issuer !== "accounts.google.com") {
    throw new VerificationProviderError("Google issuer validation failed");
  }
  if (claims.aud !== id) throw new VerificationProviderError("Google audience validation failed");
  if (input.nonce && claims.nonce !== input.nonce) throw new VerificationProviderError("Google nonce validation failed");
  const subject = stringField(claims.sub, "subject", "Google");
  return {
    providerSubjectFingerprint: subjectFingerprint("google", subject),
    status: "not_verified",
    capabilities: capabilityList(capabilities),
    accessToken: typeof token.access_token === "string" ? token.access_token : undefined,
    accessTokenDisposition: "discard_after_verification",
  };
}

async function verifyIdToken(idToken: string, nonce: string | undefined, clientId: string): Promise<Record<string, unknown>> {
  const segments = idToken.split(".");
  if (segments.length !== 3) throw new VerificationProviderError("Google ID token is invalid");
  const [encodedHeader, encodedClaims, encodedSignature] = segments;
  let header: Record<string, unknown>;
  let claims: Record<string, unknown>;
  try {
    header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8")) as Record<string, unknown>;
    claims = JSON.parse(Buffer.from(encodedClaims, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new VerificationProviderError("Google ID token is invalid");
  }
  if (header.alg !== "RS256" || typeof header.kid !== "string") {
    throw new VerificationProviderError("Google ID token is invalid");
  }
  const jwks = await getJson(jwksEndpoint, {}, "Google");
  const keys = jwks.keys;
  if (!Array.isArray(keys)) throw new VerificationProviderError("Google signing keys are invalid");
  const jwk = keys.find((key): key is Record<string, unknown> =>
    Boolean(key && typeof key === "object" && !Array.isArray(key) && (key as Record<string, unknown>).kid === header.kid),
  );
  if (!jwk || jwk.kty !== "RSA" || typeof jwk.n !== "string" || typeof jwk.e !== "string") {
    throw new VerificationProviderError("Google signing key is unavailable");
  }
  let validSignature = false;
  try {
    const publicKey = createPublicKey({
      key: { kty: "RSA", n: jwk.n, e: jwk.e },
      format: "jwk",
    });
    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${encodedHeader}.${encodedClaims}`);
    verifier.end();
    validSignature = verifier.verify(publicKey, Buffer.from(encodedSignature, "base64url"));
  } catch {
    throw new VerificationProviderError("Google ID token signature is invalid");
  }
  if (!validSignature) throw new VerificationProviderError("Google ID token signature is invalid");
  if (claims.aud !== clientId) throw new VerificationProviderError("Google audience validation failed");
  const expiresAt = typeof claims.exp === "number" ? claims.exp : NaN;
  const issuedAt = typeof claims.iat === "number" ? claims.iat : NaN;
  if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) {
    throw new VerificationProviderError("Google ID token is expired");
  }
  if (!Number.isFinite(issuedAt) || issuedAt > Math.floor(Date.now() / 1000) + 60) {
    throw new VerificationProviderError("Google ID token issue time is invalid");
  }
  if (nonce && claims.nonce !== nonce) throw new VerificationProviderError("Google nonce validation failed");
  return claims;
}

export const googleVerificationAdapter: ExternalVerificationAdapter = {
  definition: {
    provider: "google",
    capabilities,
    // Ownership verification only needs the OIDC subject. Keep the request to
    // Google's minimum `openid` scope; no profile or email claims are needed.
    minimumScopes: ["openid"],
    supportsPkce: true,
    supportsTokenRevocation: false,
    supportsReverification: false,
  },
  buildAuthorizationUrl: authorization,
  exchangeAuthorizationCode: exchange,
};
