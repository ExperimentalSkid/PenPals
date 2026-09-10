"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type GoogleAuthButtonProps = {
  errorPath?: "/sign-in" | "/sign-up";
  next?: string;
  openingLabel?: string;
  continueLabel?: string;
  errorMessage?: string;
};

/** Google Auth login only; this never starts external-account verification. */
export default function GoogleAuthButton({ errorPath = "/sign-in", next = "/app", openingLabel = "Opening Google…", continueLabel = "Continue with Google", errorMessage = "Google sign-in couldn't be completed. Please try again." }: GoogleAuthButtonProps) {
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function continueWithGoogle() {
    setPending(true);
    try {
      const params = new URLSearchParams({ mode: "login", next });
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
    <button type="button" onClick={continueWithGoogle} disabled={pending} aria-busy={pending} className="btn-secondary w-full justify-center rounded-md py-3.5 text-brand disabled:cursor-wait disabled:opacity-60">
      {pending ? openingLabel : continueLabel}
    </button>
  );
}
