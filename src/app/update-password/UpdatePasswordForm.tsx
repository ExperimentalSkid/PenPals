"use client";

import Link from "next/link";
import { useState } from "react";
import { updatePassword } from "@/app/auth/actions";

type Labels = {
  success: string;
  continue: string;
  current: string;
  currentOptional: string;
  newPassword: string;
  confirm: string;
  updating: string;
  submit: string;
};

export default function UpdatePasswordForm({ error, updated, labels }: { error: string | null; updated: boolean; labels: Labels }) {
  const [pending, setPending] = useState(false);
  if (updated) {
    return (
      <div className="mt-8 rounded-md border border-[#b9d8c8] bg-[#edf7f0] px-4 py-4 text-sm leading-6 text-brand" role="status">
        <p>{labels.success}</p>
        <Link href="/app" className="mt-2 inline-block font-semibold underline underline-offset-4">{labels.continue}</Link>
      </div>
    );
  }
  return (
    <form action={updatePassword} className="mt-8 space-y-5" onSubmit={() => setPending(true)}>
      <label htmlFor="current-password" className="field-label">
        {labels.current} <span className="font-normal text-black/45">({labels.currentOptional})</span>
        <input id="current-password" name="current_password" type="password" autoComplete="current-password" className="field mt-2 block w-full" />
      </label>
      <label htmlFor="new-password" className="field-label">
        {labels.newPassword}
        <input id="new-password" name="password" type="password" autoComplete="new-password" minLength={8} required className="field mt-2 block w-full" />
      </label>
      <label htmlFor="password-confirmation" className="field-label">
        {labels.confirm}
        <input id="password-confirmation" name="password_confirmation" type="password" autoComplete="new-password" minLength={8} required className="field mt-2 block w-full" />
      </label>
      {error && <p id="update-password-error" role="alert" aria-live="assertive" className="notice notice-error">{error}</p>}
      <button type="submit" disabled={pending} aria-busy={pending} className="btn-primary w-full justify-center disabled:cursor-wait disabled:opacity-60">{pending ? labels.updating : labels.submit}</button>
    </form>
  );
}
