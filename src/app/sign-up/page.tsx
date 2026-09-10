import type { Metadata } from "next";
import Link from "next/link";
import { signUp } from "@/app/auth/actions";
import GoogleAuthButton from "@/app/auth/GoogleAuthButton";
import BrandLogo from "@/app/components/BrandLogo";
import PublicFooter from "@/app/components/PublicFooter";
import LanguageSwitcher from "@/app/components/LanguageSwitcher";
import { getPageI18n } from "@/i18n/server";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};


export default async function SignUp({ searchParams }: { searchParams: Promise<{ error?: string; message?: string; appeal?: string }> }) {
  const { error, message, appeal } = await searchParams;
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

        <header className="mt-16">
          <p className="eyebrow">{t("auth.signUp.eyebrow")}</p>
          <h1 className="page-title">{t("auth.signUp.title")}</h1>
        <p className="page-description mt-4">{t("auth.signUp.description")}</p>
        </header>

        <div className="mt-9 space-y-4">
          <GoogleAuthButton errorPath="/sign-up" openingLabel={t("auth.google.open")} continueLabel={t("auth.google.continue")} errorMessage={t("auth.google.error")} />
          <div className="flex items-center gap-3 py-1 text-xs uppercase tracking-[.16em] text-black/40">
            <span className="h-px flex-1 bg-black/10" />
            <span>{t("common.or")}</span>
            <span className="h-px flex-1 bg-black/10" />
          </div>
        </div>

        <form action={signUp} className="mt-4 space-y-5" aria-describedby={error ? "sign-up-error" : undefined}>
          <label className="field-label">
            {t("common.email")}
            <input name="email" type="email" autoComplete="email" required className="field mt-2 block w-full" />
          </label>
          <label className="field-label">
            {t("auth.signUp.birthDate")}
            <input name="birth_date" type="date" autoComplete="bday" required className="field mt-2 block w-full" />
          </label>
          <label className="field-label">
            {t("common.password")}
            <input name="password" type="password" autoComplete="new-password" minLength={8} required className="field mt-2 block w-full" />
            <span className="mt-1 block text-xs font-normal text-black/45">{t("auth.signUp.passwordHint")}</span>
          </label>
          {error && (
            <p id="sign-up-error" role="alert" aria-live="assertive" className="notice notice-error">
              {error}
            </p>
          )}
          {appeal === "1" && (
            <p className="text-sm leading-6 text-black/60">
              {t("auth.signUp.birthWrong")} <Link href="/age-appeal" className="font-semibold text-brand underline-offset-4 hover:underline">{t("auth.signUp.correction")}</Link>
            </p>
          )}
          {message && (
            <p role="status" aria-live="polite" className="notice notice-success">
              {message}
            </p>
          )}
          <button className="btn-primary w-full justify-center">{t("auth.signUp.create")}</button>
        </form>

        <p className="mt-8 text-center text-sm text-black/60">
          {t("auth.signUp.already")} <Link href="/sign-in" className="font-semibold text-brand underline-offset-4 hover:underline">{t("common.signIn")}</Link>
        </p>
      </div>
      <PublicFooter className="mx-auto mt-12 w-full max-w-md" />
    </main>
  );
}
