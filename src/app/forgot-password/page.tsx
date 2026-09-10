import type { Metadata } from "next";
import Link from "next/link";
import { requestPasswordReset } from "@/app/auth/actions";
import AuthSubmitButton from "@/app/auth/AuthSubmitButton";
import BrandLogo from "@/app/components/BrandLogo";
import PublicFooter from "@/app/components/PublicFooter";
import { getPageI18n } from "@/i18n/server";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};


export default async function ForgotPassword({ searchParams }: { searchParams: Promise<{ message?: string; error?: string }> }) {
  const { message, error } = await searchParams;
  const { locale, t } = await getPageI18n();
  return (
    <main lang={locale} className="min-h-screen bg-[#f7f5ef] px-6 py-12 text-primary sm:py-20">
      <div className="mx-auto w-full max-w-md">
        <Link href="/" aria-label={t("common.homeAria")} className="inline-flex items-center">
          <BrandLogo variant="wordmark" priority className="h-auto w-[9.5rem]" />
        </Link>
        <Link href="/sign-in" className="mt-3 block text-sm text-black/55 underline-offset-4 hover:text-brand hover:underline">
          {t("common.backToSignIn")}
        </Link>

        <header className="mt-16">
          <p className="eyebrow">{t("auth.forgot.eyebrow")}</p>
          <h1 className="page-title">{t("auth.forgot.title")}</h1>
          <p className="page-description mt-4">{t("auth.forgot.description")}</p>
        </header>

        {message && <p role="status" aria-live="polite" className="notice notice-success mt-8">{t("auth.forgot.sent")}</p>}
        {error === "unavailable" && <p role="alert" aria-live="assertive" className="notice notice-error mt-8">{t("auth.forgot.unavailable")}</p>}
        {error === "session" && <p role="alert" aria-live="assertive" className="notice notice-error mt-8">{t("auth.forgot.session")}</p>}

        <form action={requestPasswordReset} className="mt-8 space-y-5">
          <label htmlFor="recovery-email" className="field-label">
            {t("common.email")}
            <input id="recovery-email" name="email" type="email" autoComplete="email" required className="field mt-2 block w-full" />
          </label>
          <AuthSubmitButton idleLabel={t("auth.forgot.send")} pendingLabel={t("auth.forgot.sending")} />
        </form>
      </div>
      <PublicFooter className="mx-auto mt-12 w-full max-w-md" />
    </main>
  );
}
