/**
 * Provider-neutral contract for optional external-account verification.
 *
 * This module intentionally contains no provider implementation or OAuth
 * credentials. Keep it server-only by importing it from server code/adapters;
 * the persistent model never stores access or refresh tokens and the public
 * profile contract remains a single `is_verified` boolean.
 */

/** Canonical capability names understood by the verification foundation. */
export const EXTERNAL_VERIFICATION_CAPABILITIES = {
  ownership: "ownership",
  stableAccountIdentifier: "stable_account_identifier",
  accountCreatedAt: "account_created_at",
  tokenRevocation: "token_revocation",
  reverification: "reverification",
} as const;

export type ExternalVerificationCapability =
  | (typeof EXTERNAL_VERIFICATION_CAPABILITIES)[keyof typeof EXTERNAL_VERIFICATION_CAPABILITIES]
  /** Provider-specific extensions must be namespaced and explicitly declared. */
  | `provider:${string}`;

export type ExternalVerificationStatus =
  | "not_verified"
  | "linked_not_eligible"
  | "verified";

/** The complete public contract. Provider identity and capability details stay private. */
export interface ExternalVerificationPublicState {
  readonly is_verified: boolean;
}

export type AccessTokenDisposition =
  | "discard_after_verification"
  | "retain_for_reverification";

export interface ExternalVerificationProviderDefinition {
  /** Stable internal provider key, never sent to public profile consumers. */
  readonly provider: string;
  /** Signals this adapter can actually establish. */
  readonly capabilities: readonly ExternalVerificationCapability[];
  /** Smallest scope set needed for the selected verification operation. */
  readonly minimumScopes: readonly string[];
  /** Whether this provider supports PKCE for the authorization-code flow. */
  readonly supportsPkce: boolean;
  /** Whether the adapter can revoke a provider grant when unlinking. */
  readonly supportsTokenRevocation: boolean;
  /** Whether the adapter can perform a fresh ownership check later. */
  readonly supportsReverification: boolean;
}

export interface ExternalVerificationAuthorizationRequest {
  readonly redirectUri: string;
  readonly state: string;
  /** A caller may only request scopes declared by the provider contract. */
  readonly scopes: readonly string[];
  /** Base64url PKCE challenge for providers that support PKCE. */
  readonly codeChallenge?: string;
  /** OIDC nonce for providers that return an ID token. */
  readonly nonce?: string;
}

export interface ExternalVerificationExchangeResult {
  /** One-way stable subject fingerprint; raw provider identifiers stay transient. */
  readonly providerSubjectFingerprint: string;
  readonly status: ExternalVerificationStatus;
  /** Only capabilities established by the provider response. */
  readonly capabilities: readonly ExternalVerificationCapability[];
  /** Omitted when the provider cannot prove account creation time. */
  readonly providerAccountCreatedAt?: string;
  readonly verifiedAt?: string;
  readonly reverifyAfter?: string;
  /**
   * Access token material is transient and must be discarded after this
   * operation unless a reviewed re-verification flow explicitly requires it.
   * It is never part of the database record or public profile response.
   */
  readonly accessToken?: string;
  readonly accessTokenDisposition: AccessTokenDisposition;
}

export interface ExternalVerificationAdapter {
  readonly definition: ExternalVerificationProviderDefinition;
  buildAuthorizationUrl(
    request: ExternalVerificationAuthorizationRequest,
  ): Promise<string> | string;
  exchangeAuthorizationCode(input: {
    readonly code: string;
    readonly redirectUri: string;
    /** Present for providers whose token endpoint requires PKCE. */
    readonly codeVerifier?: string;
    /** OIDC nonce, when the authorization request included one. */
    readonly nonce?: string;
  }): Promise<ExternalVerificationExchangeResult>;
  revokeGrant?(input: { readonly providerSubjectFingerprint: string }): Promise<void>;
  reverify?(input: {
    readonly providerSubjectFingerprint: string;
  }): Promise<ExternalVerificationExchangeResult>;
}

/**
 * The contract stays provider-neutral. Approved server-only adapters are
 * registered in `verification/registry.ts`; policy configuration still
 * controls whether a provider is available and can award verification.
 */
export type ExternalVerificationProviderRegistry = Readonly<
  Record<string, ExternalVerificationAdapter>
>;
