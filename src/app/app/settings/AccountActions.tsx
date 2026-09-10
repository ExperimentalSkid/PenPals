"use client";

import { useTranslations } from "next-intl";

import { deactivateAccount, reactivateAccount } from "@/app/app/profile/actions";

export default function AccountActions({ deactivated, isAdmin }: { deactivated: boolean; isAdmin: boolean }) {
  const t = useTranslations();
  if (isAdmin && !deactivated) {
    return <p className="max-w-xl text-sm leading-6 text-black/60">{t("app.settings.adminNoDeactivate")}</p>;
  }

  const message = deactivated
    ? t("app.settings.reactivateConfirm")
    : t("app.settings.deactivateConfirm");

  return <form action={deactivated ? reactivateAccount : deactivateAccount} onSubmit={(event) => {
    if (!window.confirm(message)) event.preventDefault();
  }}>
    <button className={deactivated ? "rounded-md border border-black/15 px-4 py-2.5 text-sm" : "rounded-md border border-red-300 px-4 py-2.5 text-sm text-red-700"}>
      {deactivated ? t("app.settings.reactivate") : t("app.settings.deactivate")}
    </button>
  </form>;
}
