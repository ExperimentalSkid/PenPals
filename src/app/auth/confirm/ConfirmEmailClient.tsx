"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
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

type ConfirmLabels = { eyebrow: string; title: string; description: string; confirming: string; submit: string; invalid: string; failure: string; returnLabel: string };

export default function ConfirmEmailClient({ locale, labels }: { locale: string; labels: ConfirmLabels }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const confirmation = useRef<Promise<string | null> | null>(null);

  async function handleConfirm() {
    setConfirming(true);

    async function confirm() {
      // Reuse the shared browser client (detectSessionInUrl is disabled
      // globally) instead of a one-off instance, to avoid two GoTrueClient
      // instances racing over the same localStorage session key.
      const supabase = createClient();
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
        // A token can fail here if it was already redeemed by an earlier,
        // successful click (e.g. the user clicked the email link twice).
        // Check for an existing confirmed session before treating this as a
        // real failure, since the first click already completed the job.
        const { data: existingUser } = await supabase.auth.getUser();
        if (existingUser.user?.email_confirmed_at) return null;
        return labels.invalid;
      }

      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user?.email_confirmed_at) {
        return labels.invalid;
      }
      return null;
    }

    // Reuse the operation instead of consuming the same token again if the
    // user double-clicks or a render replays.
    confirmation.current ??= confirm().catch(() => labels.failure);
    const confirmationError = await confirmation.current;

    if (confirmationError) {
      setError(confirmationError);
      setConfirming(false);
    } else {
      const type = new URLSearchParams(window.location.search).get("type");
      const destination = confirmationDestination(type);
      router.replace(destination);
    }
  }

  return (
    <main lang={locale} className="min-h-screen bg-[#f7f5ef] px-6 py-16 text-primary sm:py-24">
      <div className="mx-auto w-full max-w-md">
        <BrandLogo variant="wordmark" priority className="h-auto w-[10rem]" />
        <p className="eyebrow mt-16">{labels.eyebrow}</p>
        <h1 className="page-title">{labels.title}</h1>
        <p className="mt-5 text-base leading-7 text-black/65">
          {labels.description}
        </p>
        <button
          onClick={handleConfirm}
          disabled={confirming}
          className="mt-8 rounded-full bg-[#087456] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {confirming ? labels.confirming : labels.submit}
        </button>
        {error && <p className="notice notice-error mt-8" role="alert">{error} <a className="font-medium underline" href="/check-email">{labels.returnLabel}</a></p>}
      </div>
    </main>
  );
}
