"use client";

import Link from "next/link";
import { useState } from "react";
import { updatePassword } from "@/app/auth/actions";

export default function UpdatePasswordForm({ error, updated }: { error: string | null; updated: boolean }) {
  const [pending, setPending] = useState(false);
  if (updated) {
    return (
      <div className="mt-8 rounded-md border border-[#b9d8c8] bg-[#edf7f0] px-4 py-4 text-sm leading-6 text-[#075d46]" role="status">
        <p>Password updated successfully.</p>
        <Link href="/app" className="mt-2 inline-block font-semibold underline underline-offset-4">Continue to pen-pals.net</Link>
      </div>
    );
  }
  return (
    <form action={updatePassword} className="mt-8 space-y-5" onSubmit={() => setPending(true)}>
      <label htmlFor="current-password" className="field-label">
        Current password <span className="font-normal text-black/45">(optional for recovery)</span>
        <input id="current-password" name="current_password" type="password" autoComplete="current-password" className="field mt-2 block w-full" />
      </label>
      <label htmlFor="new-password" className="field-label">
        New password
        <input id="new-password" name="password" type="password" autoComplete="new-password" minLength={8} required className="field mt-2 block w-full" />
      </label>
      <label htmlFor="password-confirmation" className="field-label">
        Confirm new password
        <input id="password-confirmation" name="password_confirmation" type="password" autoComplete="new-password" minLength={8} required className="field mt-2 block w-full" />
      </label>
      {error && <p id="update-password-error" role="alert" aria-live="assertive" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">{error}</p>}
      <button type="submit" disabled={pending} aria-busy={pending} className="btn-primary w-full justify-center disabled:cursor-wait disabled:opacity-60">{pending ? "Updating…" : "Update password"}</button>
    </form>
  );
}
