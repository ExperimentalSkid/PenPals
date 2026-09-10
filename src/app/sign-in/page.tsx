import type { Metadata } from "next";
import Link from "next/link";
import { signIn } from "@/app/auth/actions";
import AuthSubmitButton from "@/app/auth/AuthSubmitButton";
import GoogleAuthButton from "@/app/auth/GoogleAuthButton";
import BrandLogo from "@/app/components/BrandLogo";
import PublicFooter from "@/app/components/PublicFooter";
import LanguageSwitcher from "@/app/components/LanguageSwitcher";
import { getPageI18n } from "@/i18n/server";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};


export default async function SignIn({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { locale, t } = await getPageI18n();

  return (
    <main lang={locale} className="min-h-screen bg-[#f7f5ef] px-6 py-12 text-primary sm:py-20">
      <div className="mx-auto w-full max-w-md">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" aria-label={t("common.homeAria")} className="inline-flex items-center">
            <BrandLogo variant="wordmark" priority className="h-auto w-[9.5rem]" />
          </Link>
          <LanguageSwitcher locale={locale} label={t("common.language")} />
        </div>
        <Link href="/" className="mt-3 block text-sm text-black/55 underline-offset-4 hover:text-brand hover:underline">
          {t("common.backHome")}
        </Link>

        <header className="mt-16">
          <p className="eyebrow">{t("auth.signIn.eyebrow")}</p>
          <h1 className="page-title">{t("auth.signIn.title")}</h1>
          <p className="page-description mt-4">{t("auth.signIn.description")}</p>
        </header>

        <div className="mt-9 space-y-4">
          <GoogleAuthButton openingLabel={t("auth.google.open")} continueLabel={t("auth.google.continue")} errorMessage={t("auth.google.error")} />
          <div className="flex items-center gap-3 py-1 text-xs uppercase tracking-[.16em] text-black/40">
            <span className="h-px flex-1 bg-black/10" />
            <span>{t("common.or")}</span>
            <span className="h-px flex-1 bg-black/10" />
          </div>
        </div>

        <form action={signIn} className="mt-4 space-y-5" aria-describedby={error ? "sign-in-error" : undefined}>
          <label htmlFor="sign-in-identifier" className="field-label">
            {t("auth.signIn.identifier")}
            <input id="sign-in-identifier" name="identifier" type="text" autoComplete="username" required className="field mt-2 block w-full" />
          </label>
          <label htmlFor="sign-in-password" className="field-label">
            {t("common.password")}
            <input id="sign-in-password" name="password" type="password" autoComplete="current-password" required className="field mt-2 block w-full" />
          </label>
          <div className="-mt-2 text-right text-sm"><Link href="/forgot-password" className="font-medium text-brand underline-offset-4 hover:underline">{t("auth.signIn.forgot")}</Link></div>
          {error && (
            <p id="sign-in-error" role="alert" aria-live="assertive" className="notice notice-error">
              {error}
            </p>
          )}
          <AuthSubmitButton idleLabel={t("auth.signIn.submit")} pendingLabel={t("auth.signIn.submitting")} />
        </form>

        <p className="mt-8 text-center text-sm text-black/60">
          {t("auth.signIn.newHere")} <Link href="/sign-up" className="font-semibold text-brand underline-offset-4 hover:underline">{t("auth.signIn.create")}</Link>
        </p>
      </div>
      <PublicFooter className="mx-auto mt-12 w-full max-w-md" />
    </main>
  );
}
