"use server";
import { createClient } from "@/lib/supabase/server";
import { VerificationConfigurationError } from "@/lib/verification/oauth";
import { verificationSiteUrl, emailConfirmationOrigin } from "@/lib/verification/server";
import { cookies, headers } from "next/headers";
import { createGoogleLoginIntent, googleLoginCallbackUrl, googleLoginIntentCookie, googleLoginIntentMaxAge, GoogleLoginConfigurationError } from "@/lib/auth/google-login";
import { redirect } from "next/navigation";
import { getPageI18n } from "@/i18n/server";

const confirmationRedirect = async () => `${emailConfirmationOrigin(await headers())}/auth/confirm`;

async function authClientIp() {
  const requestHeaders = await headers();
  const trusted = requestHeaders.get("x-real-ip")?.trim();
  if (trusted) return trusted;
  if (process.env.NODE_ENV !== "production") return requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  return null;
}

export async function signIn(formData: FormData) {
  const { t } = await getPageI18n();
  const supabase = await createClient(await authClientIp());
// After the login succeeds, before the redirect
await supabase.auth.getSession();
  // Keep accepting the legacy `email` field while allowing the sign-in
  // surface to pass either a profile username or an email identifier.
  const identifier = String(formData.get("identifier") ?? formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!identifier || !password) redirect(`/sign-in?error=${encodeURIComponent(t("server.auth.missingCredentials"))}`);

  // Let Supabase handle canonical email sign-ins first so its existing
  // confirmation/error semantics remain unchanged. Usernames and configured
  // aliases are resolved only after the password has been checked by the
  // private database function; that function never returns an email for an
  // invalid password.
  const looksLikeEmail = identifier.includes("@");
  let data: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>["data"] = { user: null, session: null };
  let error: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>["error"] = null;
  if (looksLikeEmail) {
    ({ data, error } = await supabase.auth.signInWithPassword({ email: identifier, password }));
    if (error?.code === "email_not_confirmed" || error?.message.toLowerCase().includes("email not confirmed")) redirect("/check-email");
  }

  if (!data.user) {
    // Username and configured alias lookups do not pass through Supabase's
    // /auth/v1/token endpoint. Add a server-derived client bucket before the
    // resolver so identifier logins receive the same abuse protection as
    // canonical email sign-ins (the resolver also keeps a per-identifier
    // bucket for direct RPC callers).
    const requestHeaders = await headers();
    const forwardedFor = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
    const clientAddress = forwardedFor || requestHeaders.get("x-real-ip")?.trim() || requestHeaders.get("cf-connecting-ip")?.trim();
    if (clientAddress) {
      const { data: clientAllowed, error: clientLimitError } = await supabase.rpc("consume_login_client_attempt", { p_client_key: clientAddress });
      if (clientLimitError || clientAllowed === false) {
        redirect(`/sign-in?error=${encodeURIComponent(t("server.auth.signInWait"))}`);
      }
    }
    const { data: resolvedEmail, error: resolveError } = await supabase.rpc("resolve_login_identifier", {
      p_identifier: identifier,
      p_password: password,
    });
    const canonicalEmail = typeof resolvedEmail === "string" ? resolvedEmail : "";
    if (resolveError || !canonicalEmail) {
      // Keep credential failures neutral so the sign-in surface does not
      // expose provider-specific details or account-enumeration hints.
      redirect(`/sign-in?error=${encodeURIComponent(t("server.auth.signInCredentials"))}`);
    }
    ({ data, error } = await supabase.auth.signInWithPassword({ email: canonicalEmail, password }));
  }

  if (error) {
    if (error.code === "email_not_confirmed" || error.message.toLowerCase().includes("email not confirmed")) redirect("/check-email");
    // Keep credential failures neutral so the sign-in surface does not expose
    // provider-specific details or account-enumeration hints.
    redirect(`/sign-in?error=${encodeURIComponent(t("server.auth.signInEmailPassword"))}`);
  }
  if (!data.user?.email_confirmed_at) {
    await supabase.auth.signOut();
    redirect("/check-email");
  }
  const { data: ageRestricted, error: ageRestrictionError } = await supabase.rpc("is_current_user_age_restricted");
  if (ageRestrictionError) redirect(`/sign-in?error=${encodeURIComponent(t("server.auth.accountUnavailable"))}`);
  if (ageRestricted) redirect("/age-appeal");
  redirect("/app");
}

export async function signUp(formData: FormData) {
  const { locale, t } = await getPageI18n();
  const supabase = await createClient(await authClientIp());
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const birthDate = String(formData.get("birth_date") ?? "");
  const { data: ageResult, error: ageError } = await supabase.rpc("age_gate_signup", { p_email: email, p_birth_date: birthDate || null });
  if (ageError) redirect(`/sign-up?error=${encodeURIComponent(t("server.auth.ageUnavailable"))}`);
  if (ageResult === "underage") redirect(`/sign-up?error=${encodeURIComponent(t("server.auth.underage"))}`);
  if (password.length < 8) redirect(`/sign-up?error=${encodeURIComponent(t("server.auth.passwordLength"))}`);
  try {
    const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: await confirmationRedirect(), data: { locale } } });
    if (error) redirect(`/sign-up?error=${encodeURIComponent(t("server.auth.signInEmailPassword"))}`);
  } catch (error) {
    if (error instanceof VerificationConfigurationError) redirect(`/sign-up?error=${encodeURIComponent(t("server.auth.emailVerificationUnavailable"))}`);
    throw error;
  }
  redirect("/check-email");
}

/**
 * Starts the standard Supabase recovery flow. The response is intentionally
 * generic so it cannot be used to enumerate registered email addresses.
 */
export async function requestPasswordReset(formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || email.length > 320) redirect("/forgot-password?message=1");
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: await confirmationRedirect() });
    if (error) redirect("/forgot-password?message=1");
  } catch (error) {
    if (error instanceof VerificationConfigurationError) redirect("/forgot-password?error=unavailable");
    throw error;
  }
  redirect("/forgot-password?message=1");
}

/** Updates a password from the authenticated recovery or settings session. */
export async function updatePassword(formData: FormData) {
  const { t } = await getPageI18n();
  const currentPassword = String(formData.get("current_password") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("password_confirmation") ?? "");
  if (password.length < 8) redirect(`/update-password?error=${encodeURIComponent(t("server.auth.passwordLength"))}`);
  if (password !== confirmation) redirect(`/update-password?error=${encodeURIComponent(t("server.auth.passwordMismatch"))}`);
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) redirect("/forgot-password?error=session");
  const { error } = await supabase.auth.updateUser(currentPassword ? { password, current_password: currentPassword } : { password });
  if (error) redirect(`/update-password?error=${encodeURIComponent(t("server.auth.passwordUpdateFailed"))}`);
  redirect("/update-password?updated=1");
}

/** Changes a password from Settings after verifying the current password. */
export async function changePassword(formData: FormData) {
  const currentPassword = String(formData.get("current_password") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("password_confirmation") ?? "");
  if (!currentPassword) redirect("/app/settings?security=password-error");
  if (password.length < 8) redirect("/app/settings?security=password-too-short");
  if (password !== confirmation) redirect("/app/settings?security=password-mismatch");
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) redirect("/sign-in");
  const { error } = await supabase.auth.updateUser({ password, current_password: currentPassword });
  redirect(`/app/settings?security=${error ? "password-error" : "password-updated"}`);
}

export async function resendVerificationEmail(formData: FormData) {
  const { t } = await getPageI18n();
  const supabase = await createClient();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) redirect(`/check-email?error=${encodeURIComponent(t("server.auth.resendEmailRequired"))}`);

  // Keep the response generic so this endpoint cannot be used for account
  // enumeration. Supabase applies its own email-send rate limits as well.
  try {
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: await confirmationRedirect() },
    });
    if (error) redirect(`/check-email?error=${encodeURIComponent(t("server.auth.resendFailed"))}`);
  } catch (error) {
    if (error instanceof VerificationConfigurationError) redirect(`/check-email?error=${encodeURIComponent(t("server.auth.emailVerificationUnavailable"))}`);
    throw error;
  }
  redirect("/check-email?sent=1");
}

/**
 * Starts an authenticated Google identity-linking flow. Supabase Auth owns the
 * provider identity and rejects identities already linked to another account;
 * no email-only account merge is performed here.
 */
export async function startGoogleLink() {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) redirect("/sign-in");

  const { data: identityData, error: identityError } = await supabase.auth.getUserIdentities();
  if (identityError) redirect("/app/settings?login=error");
  if (identityData.identities.some((identity) => identity.provider === "google")) redirect("/app/settings?login=connected");

  let intent: string;
  let redirectTo: string;
  try {
    intent = createGoogleLoginIntent(userData.user.id);
    const configuredOrigin = verificationSiteUrl();
    const requestHeaders = await headers();
    const forwardedHost = requestHeaders.get("x-forwarded-host")?.split(",")[0]?.trim();
    const host = forwardedHost || requestHeaders.get("host")?.trim();
    const forwardedProto = requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const protocol = forwardedProto || "http";
    let callbackOrigin = configuredOrigin;
    if (host && (protocol === "http" || protocol === "https")) {
      try {
        const candidateUrl = new URL(`${protocol}://${host}`);
        const localAlias = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(candidateUrl.hostname)
          && candidateUrl.port === "3000";
        // The configured site URL remains authoritative outside the local
        // setup. When it is the development default, preserve localhost/127
        // aliases so the Auth session stays on the origin that started it.
        if (candidateUrl.origin === configuredOrigin || (configuredOrigin === "http://localhost:3000" && localAlias)) {
          callbackOrigin = candidateUrl.origin;
        }
      } catch {
        // Keep the configured origin when forwarded host data is malformed.
      }
    }
    redirectTo = googleLoginCallbackUrl("link", callbackOrigin);
  } catch (error) {
    if (error instanceof GoogleLoginConfigurationError || error instanceof VerificationConfigurationError) redirect("/app/settings?login=unavailable");
    throw error;
  }

  const { data, error } = await supabase.auth.linkIdentity({
    provider: "google",
    options: { redirectTo, scopes: "openid email", skipBrowserRedirect: true },
  });
  if (error || !data?.url) redirect("/app/settings?login=error");

  const cookieStore = await cookies();
  cookieStore.set(googleLoginIntentCookie, intent, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/auth/callback",
    maxAge: googleLoginIntentMaxAge,
  });
  redirect(data.url);
}

export async function signOut() { const supabase = await createClient(); await supabase.auth.signOut(); redirect("/"); }

/** Revokes other active sessions while leaving the current browser signed in. */
export async function signOutOtherSessions() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/sign-in");
  const { error } = await supabase.auth.signOut({ scope: "others" });
  redirect(`/app/settings?security=${error ? "error" : "sessions-revoked"}`);
}
