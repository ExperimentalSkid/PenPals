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
const authorizationEndpoint = optionalEnv("FACEBOOK_VERIFICATION_AUTHORIZATION_URL", "https://www.facebook.com/v23.0/dialog/oauth");
const graphEndpoint = optionalEnv("FACEBOOK_VERIFICATION_GRAPH_URL", "https://graph.facebook.com/v23.0");

function clientId() {
  return requiredEnv("FACEBOOK_VERIFICATION_CLIENT_ID");
}

function clientSecret() {
  return requiredEnv("FACEBOOK_VERIFICATION_CLIENT_SECRET");
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
  const id = clientId();
  const tokenEndpoint = `${graphEndpoint}/oauth/access_token`;
  const token = await postForm(tokenEndpoint, {
    code: input.code,
    client_id: id,
    client_secret: clientSecret(),
    redirect_uri: input.redirectUri,
  }, "Facebook");
  const accessToken = stringField(token.access_token, "access_token", "Facebook");
  const userUrl = new URL(`${graphEndpoint}/me`);
  userUrl.searchParams.set("fields", "id");
  const user = await getJson(userUrl.toString(), { authorization: `Bearer ${accessToken}` }, "Facebook");
  const subject = stringField(user.id, "user id", "Facebook");

  // Debugging the token verifies that the assertion belongs to this app and
  // protects against accepting a valid token issued for another client.
  const debugUrl = new URL(`${graphEndpoint}/debug_token`);
  debugUrl.searchParams.set("input_token", accessToken);
  const debug = await getJson(debugUrl.toString(), { authorization: `Bearer ${id}|${clientSecret()}` }, "Facebook");
  const debugData = debug.data;
  if (!debugData || typeof debugData !== "object" || Array.isArray(debugData)) throw new Error("Facebook token validation failed");
  const details = debugData as Record<string, unknown>;
  if (details.is_valid !== true || details.app_id !== id || details.user_id !== subject) throw new Error("Facebook token validation failed");

  return {
    providerSubjectFingerprint: subjectFingerprint("facebook", subject),
    status: "not_verified",
    capabilities: capabilityList(capabilities),
    accessToken,
    accessTokenDisposition: "discard_after_verification",
  };
}

export const facebookVerificationAdapter: ExternalVerificationAdapter = {
  definition: {
    provider: "facebook",
    capabilities,
    minimumScopes: ["public_profile"],
    supportsPkce: false,
    supportsTokenRevocation: false,
    supportsReverification: false,
  },
  buildAuthorizationUrl: authorization,
  exchangeAuthorizationCode: exchange,
};
