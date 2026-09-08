"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import BrandLogo from "@/app/components/BrandLogo";

/**
 * Signup confirmations are the only confirmation flow that should enter the
 * first-time profile setup screen directly. Other confirmation types (such as
 * an email change or a returning account's re-confirmation) must go through
 * the normal app boundary so it can apply the same server-side completion,
 * age-gate, and deactivation checks as every other app entry point.
 *
 * Unknown/missing types intentionally keep the historical setup destination:
 * Supabase's PKCE signup links can omit `type`, and setup is the safe
 * onboarding destination for that flow.
 */
export function confirmationDestination(type: string | null) {
  if (type === "recovery") return "/update-password";
  return type === "email" || type === "email_change" || type === "invite" || type === "magiclink"
    ? "/app"
    : "/app/profile/setup";
}

export default function ConfirmEmail() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const confirmation = useRef<Promise<string | null> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function confirm() {
      // This page handles all supported confirmation formats explicitly. The
      // default browser client also consumes URL codes during initialization,
      // which would redeem a one-use code twice. Keep this client local to the
      // confirmation operation; other browser clients retain their defaults.
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        { isSingleton: false, auth: { detectSessionInUrl: false } },
      );
      const searchParams = new URLSearchParams(window.location.search);
      const queryToken = searchParams.get("token_hash");
      const type = searchParams.get("type");
      const code = searchParams.get("code");
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");

      let confirmationError: { message: string } | null = null;
      if (queryToken && type) {
        ({ error: confirmationError } = await supabase.auth.verifyOtp({ token_hash: queryToken, type: type as EmailOtpType }));
      } else if (code) {
        const flowId = searchParams.get("sb_flow_id");
        ({ error: confirmationError } = await supabase.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined));
      } else if (accessToken && refreshToken) {
        ({ error: confirmationError } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }));
      } else {
        confirmationError = { message: "missing confirmation token" };
      }

      if (confirmationError) {
        return "Confirmation link is invalid or expired.";
      }

      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user?.email_confirmed_at) {
        return "Confirmation link is invalid or expired.";
      }
      return null;
    }

    // React can replay effects in development. Reuse the operation instead of
    // consuming the same token again, but let the current effect handle UI.
    confirmation.current ??= confirm().catch(() => "We couldn't confirm your email. Please try again.");
    void confirmation.current.then((confirmationError) => {
      if (cancelled) return;
      if (confirmationError) setError(confirmationError);
      else {
        const type = new URLSearchParams(window.location.search).get("type");
        const destination = confirmationDestination(type);
        // Keep the explicit setup call for the signup path easy to audit and
        // preserve the existing first-time onboarding behavior.
        if (destination === "/app/profile/setup") router.replace("/app/profile/setup");
        else router.replace(destination);
      }
    });
    return () => { cancelled = true; };
  }, [router]);

  return (
    <main className="min-h-screen bg-[#f7f5ef] px-6 py-16 text-[#16251f] sm:py-24">
      <div className="mx-auto w-full max-w-md">
        <BrandLogo variant="wordmark" priority className="h-auto w-[10rem]" />
        <p className="mt-16 text-xs font-bold uppercase tracking-[.2em] text-[#087456]">Email confirmation</p>
        <h1 className="mt-3 font-serif text-5xl tracking-[-0.03em] text-[#10231d]">Confirming your email</h1>
        <p className="mt-5 text-base leading-7 text-black/65">We&apos;re finishing your account setup.</p>
        {error && <p className="mt-8 border-l-2 border-red-400 px-3 py-2 text-sm text-red-700" role="alert">{error} <a className="font-medium underline" href="/check-email">Return to email confirmation</a></p>}
      </div>
    </main>
  );
}
