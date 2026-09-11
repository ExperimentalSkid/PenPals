"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { prepareGoogleSignupLegalAcceptance } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/client";

type GoogleAuthButtonProps = {
  errorPath?: "/sign-in" | "/sign-up";
  next?: string;
  openingLabel?: string;
  continueLabel?: string;
  errorMessage?: string;
  legalSignup?: boolean;
  legalPrefix?: string;
  legalAnd?: string;
  termsLabel?: string;
  privacyLabel?: string;
  inviteToken?: string;
};

/** Google Auth login only; this never starts external-account verification. */
export default function GoogleAuthButton({ errorPath = "/sign-in", next = "/app", openingLabel = "Opening Google…", continueLabel = "Continue with Google", errorMessage = "Google sign-in couldn't be completed. Please try again.", legalSignup = false, legalPrefix = "I agree to the", legalAnd = "and acknowledge the", termsLabel = "Terms", privacyLabel = "Privacy Policy", inviteToken }: GoogleAuthButtonProps) {
  const [pending, setPending] = useState(false);
  const [legalAccepted, setLegalAccepted] = useState(false);
  const router = useRouter();

  async function continueWithGoogle() {
    if (legalSignup && !legalAccepted) return;
    setPending(true);
    try {
      if (legalSignup) {
        await prepareGoogleSignupLegalAcceptance(inviteToken);
      }
      const params = new URLSearchParams({ mode: "login", next, ...(legalSignup ? { entry: "signup" } : {}) });
      const redirectTo = `${window.location.origin}/auth/callback?${params.toString()}`;
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo, scopes: "openid email", skipBrowserRedirect: true },
      });
      if (error || !data?.url) throw new Error("oauth-unavailable");
      window.location.assign(data.url);
    } catch {
      setPending(false);
      router.replace(`${errorPath}?error=${encodeURIComponent(errorMessage)}`);
    }
  }

  return (
    <div className="space-y-3">
      {legalSignup && (
        <label className="flex items-start gap-3 text-sm leading-6 text-black/60">
          <input type="checkbox" checked={legalAccepted} onChange={(event) => setLegalAccepted(event.target.checked)} className="mt-1 h-4 w-4 shrink-0" />
          <span>{legalPrefix} <Link href="/terms" className="font-semibold text-brand underline underline-offset-2">{termsLabel}</Link> {legalAnd} <Link href="/privacy" className="font-semibold text-brand underline underline-offset-2">{privacyLabel}</Link>.</span>
        </label>
      )}
      <button type="button" onClick={continueWithGoogle} disabled={pending || (legalSignup && !legalAccepted)} aria-busy={pending} className="btn-secondary w-full justify-center rounded-md py-3.5 text-brand disabled:cursor-not-allowed disabled:opacity-50">
        {pending ? openingLabel : continueLabel}
      </button>
    </div>
  );
}
