"use client";

import { useFormStatus } from "react-dom";

export default function ProfileSaveButton({ isEdit, isOnboarding = false }: { isEdit: boolean; isOnboarding?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className={`btn-primary rounded-lg px-6 py-3 transition ${isOnboarding ? "w-full sm:w-auto" : ""} ${pending ? "cursor-wait opacity-70" : ""}`}
    >
      {pending ? "Saving…" : isOnboarding ? "Save and continue" : isEdit ? "Save changes" : "Create profile"}
      <span className="ml-2" aria-hidden="true">✦</span>
    </button>
  );
}
