import type { Metadata } from "next";
import Link from "next/link";
import UpdatePasswordForm from "./UpdatePasswordForm";
import BrandLogo from "@/app/components/BrandLogo";
import PublicFooter from "@/app/components/PublicFooter";
import { getPageI18n } from "@/i18n/server";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function UpdatePassword({ searchParams }: { searchParams: Promise<{ error?: string; updated?: string }> }) {
  const { error, updated } = await searchParams;
  const { locale, t } = await getPageI18n();
  return (
    <main lang={locale} className="min-h-screen bg-[#f7f5ef] px-6 py-12 text-primary sm:py-20">
      <div className="mx-auto w-full max-w-md">
        <Link href="/" aria-label={t("common.homeAria")} className="inline-flex items-center">
          <BrandLogo variant="wordmark" priority className="h-auto w-[9.5rem]" />
        </Link>
        <header className="mt-16">
          <p className="eyebrow">{t("auth.update.eyebrow")}</p>
          <h1 className="page-title">{t("auth.update.title")}</h1>
          <p className="page-description mt-4">{t("auth.update.description")}</p>
        </header>
        <UpdatePasswordForm
          error={error ?? null}
          updated={updated === "1"}
          labels={{
            success: t("auth.update.success"),
            continue: t("auth.update.continue"),
            current: t("auth.update.current"),
            currentOptional: t("auth.update.currentOptional"),
            newPassword: t("auth.update.new"),
            confirm: t("auth.update.confirm"),
            updating: t("auth.update.updating"),
            submit: t("auth.update.submit"),
          }}
        />
      </div>
      <PublicFooter className="mx-auto mt-12 w-full max-w-md" />
    </main>
  );
}
