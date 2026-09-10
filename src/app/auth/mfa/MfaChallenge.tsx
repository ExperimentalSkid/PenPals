"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Labels = {
  code: string;
  submit: string;
  verifying: string;
  invalid: string;
  unavailable: string;
  noFactor: string;
  signOut: string;
};

export default function MfaChallenge({ labels }: { labels: Labels }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) { setError(labels.invalid); return; }
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: factors, error: factorError } = await supabase.auth.mfa.listFactors();
      if (factorError) throw factorError;
      const factor = factors.totp.find((candidate) => candidate.status === "verified");
      if (!factor) { setError(labels.noFactor); return; }
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: factor.id });
      if (challengeError) throw challengeError;
      const { error: verifyError } = await supabase.auth.mfa.verify({ factorId: factor.id, challengeId: challenge.id, code });
      if (verifyError) { setError(labels.invalid); return; }
      router.replace("/app");
      router.refresh();
    } catch {
      setError(labels.unavailable);
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/sign-in");
    router.refresh();
  }
  return (
    <div className="mt-8">
      <form onSubmit={verify} className="space-y-4">
        <label className="field-label" htmlFor="login-mfa-code">{labels.code}<input id="login-mfa-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required autoFocus className="field mt-2 block w-full" /></label>
        {error && <p role="alert" className="notice notice-error">{error}</p>}
        <button type="submit" disabled={busy || code.length !== 6} className="btn-primary w-full disabled:opacity-60">{busy ? labels.verifying : labels.submit}</button>
      </form>
      <button type="button" onClick={() => void signOut()} className="mt-4 w-full rounded-md border border-black/15 px-4 py-2.5 text-sm font-medium text-brand">{labels.signOut}</button>
    </div>
  );
}
