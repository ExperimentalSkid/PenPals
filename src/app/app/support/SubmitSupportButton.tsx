"use client";

import { useTranslations } from "next-intl";

import { useFormStatus } from "react-dom";

export default function SubmitSupportButton() {
  const t = useTranslations();
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} aria-disabled={pending} className="btn-primary px-5 py-2.5 disabled:cursor-wait disabled:opacity-60">
      {pending ? t("app.support.submitting") : t("app.support.submit")}
    </button>
  );
}
