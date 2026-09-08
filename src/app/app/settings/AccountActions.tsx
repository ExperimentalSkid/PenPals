"use client";

import { deactivateAccount, reactivateAccount } from "@/app/app/profile/actions";

export default function AccountActions({ deactivated, isAdmin }: { deactivated: boolean; isAdmin: boolean }) {
  if (isAdmin && !deactivated) {
    return <p className="max-w-xl text-sm leading-6 text-black/60">Administrator accounts can&apos;t be deactivated from Settings. Use another administrator account to manage account access.</p>;
  }

  const message = deactivated
    ? "Reactivate your account? This restores access to your profile and conversations."
    : "Deactivate your account? You will be signed out and your profile will be unavailable until the account is reactivated.";

  return <form action={deactivated ? reactivateAccount : deactivateAccount} onSubmit={(event) => {
    if (!window.confirm(message)) event.preventDefault();
  }}>
    <button className={deactivated ? "rounded-md border border-black/15 px-4 py-2.5 text-sm" : "rounded-md border border-red-300 px-4 py-2.5 text-sm text-red-700"}>
      {deactivated ? "Reactivate account" : "Deactivate account"}
    </button>
  </form>;
}
