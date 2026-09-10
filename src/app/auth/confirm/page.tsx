import type { Metadata } from "next";
import ConfirmEmailClient from "./ConfirmEmailClient";
import { getPageI18n } from "@/i18n/server";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function ConfirmEmailPage() {
  const { locale, t } = await getPageI18n();
  return <ConfirmEmailClient locale={locale} labels={{
    eyebrow: t("auth.confirm.eyebrow"),
    title: t("auth.confirm.title"),
    description: t("auth.confirm.description"),
    confirming: t("auth.confirm.confirming"),
    submit: t("auth.confirm.submit"),
    invalid: t("auth.confirm.invalid"),
    failure: t("auth.confirm.failure"),
    returnLabel: t("auth.confirm.return"),
  }} />;
}
