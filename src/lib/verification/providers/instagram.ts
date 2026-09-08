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
const authorizationEndpoint = optionalEnv("INSTAGRAM_VERIFICATION_AUTHORIZATION_URL", "https://www.instagram.com/oauth/authorize");
const tokenEndpoint = optionalEnv("INSTAGRAM_VERIFICATION_TOKEN_URL", "https://api.instagram.com/oauth/access_token");
const graphEndpoint = optionalEnv("INSTAGRAM_VERIFICATION_GRAPH_URL", "https://graph.instagram.com/me");

function clientId() {
  return requiredEnv("INSTAGRAM_VERIFICATION_CLIENT_ID");
}

function clientSecret() {
  return requiredEnv("INSTAGRAM_VERIFICATION_CLIENT_SECRET");
}

function authorization(request: ExternalVerificationAuthorizationRequest): string {
  return buildAuthorizationUrl(authorizationEndpoint, {
    client_id: clientId(),
    redirect_uri: request.redirectUri,
    response_type: "code",
    scope: request.scopes.join(","),
    state: request.state,
  });
}

async function exchange(input: { code: string; redirectUri: string }): Promise<ExternalVerificationExchangeResult> {
  const token = await postForm(tokenEndpoint, {
    client_id: clientId(),
    client_secret: clientSecret(),
    grant_type: "authorization_code",
    redirect_uri: input.redirectUri,
    code: input.code,
  }, "Instagram");
  const accessToken = stringField(token.access_token, "access_token", "Instagram");
  const userUrl = new URL(graphEndpoint);
  userUrl.searchParams.set("fields", "user_id");
  const user = await getJson(userUrl.toString(), { authorization: `Bearer ${accessToken}` }, "Instagram");
  // The current Instagram Login product calls this field user_id; accept id
  // as a compatibility response without requesting or storing a username.
  const subject = stringField(user.user_id ?? user.id, "user id", "Instagram");
  return {
    providerSubjectFingerprint: subjectFingerprint("instagram", subject),
    status: "not_verified",
    capabilities: capabilityList(capabilities),
    accessToken,
    accessTokenDisposition: "discard_after_verification",
  };
}

export const instagramVerificationAdapter: ExternalVerificationAdapter = {
  definition: {
    provider: "instagram",
    capabilities,
    minimumScopes: ["instagram_business_basic"],
    supportsPkce: false,
    supportsTokenRevocation: false,
    supportsReverification: false,
  },
  buildAuthorizationUrl: authorization,
  exchangeAuthorizationCode: exchange,
};
