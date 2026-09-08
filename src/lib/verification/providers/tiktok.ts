import type {
  ExternalVerificationAdapter,
  ExternalVerificationExchangeResult,
  ExternalVerificationAuthorizationRequest,
} from "@/lib/verification/providers";
import {
  buildAuthorizationUrl,
  capabilityList,
  getJson,
  optionalEnv,
  postForm,
  requiredEnv,
  stringField,
  subjectFingerprint,
} from "@/lib/verification/oauth";

const capabilities = ["ownership", "stable_account_identifier"] as const;
const authorizationEndpoint = optionalEnv("TIKTOK_VERIFICATION_AUTHORIZATION_URL", "https://www.tiktok.com/v2/auth/authorize/");
const tokenEndpoint = optionalEnv("TIKTOK_VERIFICATION_TOKEN_URL", "https://open.tiktokapis.com/v2/oauth/token/");
const userInfoEndpoint = optionalEnv("TIKTOK_VERIFICATION_USERINFO_URL", "https://open.tiktokapis.com/v2/user/info/");

function clientKey() {
  return requiredEnv("TIKTOK_VERIFICATION_CLIENT_KEY");
}

function clientSecret() {
  return requiredEnv("TIKTOK_VERIFICATION_CLIENT_SECRET");
}

function authorization(request: ExternalVerificationAuthorizationRequest): string {
  return buildAuthorizationUrl(authorizationEndpoint, {
    client_key: clientKey(),
    redirect_uri: request.redirectUri,
    response_type: "code",
    scope: request.scopes.join(","),
    state: request.state,
    code_challenge: request.codeChallenge,
    code_challenge_method: request.codeChallenge ? "S256" : undefined,
  });
}

async function exchange(input: { code: string; redirectUri: string; codeVerifier?: string }): Promise<ExternalVerificationExchangeResult> {
  const token = await postForm(tokenEndpoint, {
    client_key: clientKey(),
    client_secret: clientSecret(),
    code: input.code,
    grant_type: "authorization_code",
    redirect_uri: input.redirectUri,
    code_verifier: input.codeVerifier,
  }, "TikTok");
  const accessToken = stringField(token.access_token, "access_token", "TikTok");
  const userUrl = new URL(userInfoEndpoint);
  userUrl.searchParams.set("fields", "open_id,union_id");
  const response = await getJson(userUrl.toString(), { authorization: `Bearer ${accessToken}` }, "TikTok");
  const data = response.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("TikTok user response is invalid");
  const user = (data as Record<string, unknown>).user;
  if (!user || typeof user !== "object" || Array.isArray(user)) throw new Error("TikTok user response is invalid");
  const record = user as Record<string, unknown>;
  const subject = stringField(record.union_id ?? record.open_id, "user id", "TikTok");
  return {
    providerSubjectFingerprint: subjectFingerprint("tiktok", subject),
    status: "not_verified",
    capabilities: capabilityList(capabilities),
    accessToken,
    accessTokenDisposition: "discard_after_verification",
  };
}

export const tiktokVerificationAdapter: ExternalVerificationAdapter = {
  definition: {
    provider: "tiktok",
    capabilities,
    minimumScopes: ["user.info.basic"],
    supportsPkce: true,
    supportsTokenRevocation: false,
    supportsReverification: false,
  },
  buildAuthorizationUrl: authorization,
  exchangeAuthorizationCode: exchange,
};
