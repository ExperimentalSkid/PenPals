"use client";

import { useTranslations } from "next-intl";

import { useFormStatus } from "react-dom";

export default function ProfileSaveButton({ isEdit, isOnboarding = false }: { isEdit: boolean; isOnboarding?: boolean }) {
  const t = useTranslations();
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className={`btn-primary rounded-lg px-6 py-3 transition ${isOnboarding ? "w-full sm:w-auto" : ""} ${pending ? "cursor-wait opacity-70" : ""}`}
    >
      {pending ? t("app.profile.save") : isOnboarding ? t("app.profile.saveContinueButton") : isEdit ? t("app.profile.saveChanges") : t("app.profile.createProfile")}
      <span className="ml-2" aria-hidden="true">✦</span>
    </button>
  );
}
