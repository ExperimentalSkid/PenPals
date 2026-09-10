import type { Metadata } from "next";
import Link from "next/link";
import { resendVerificationEmail } from "@/app/auth/actions";
import BrandLogo from "@/app/components/BrandLogo";
import PublicFooter from "@/app/components/PublicFooter";
import { getPageI18n } from "@/i18n/server";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};


export default async function CheckEmail({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const { error, sent } = await searchParams;
  const { locale, t } = await getPageI18n();

  return (
    <main lang={locale} className="min-h-screen bg-[#f7f5ef] px-6 py-16 text-primary sm:py-24">
      <div className="mx-auto w-full max-w-md">
        <Link href="/" aria-label={t("common.homeAria")} className="inline-flex items-center">
          <BrandLogo variant="wordmark" priority className="h-auto w-[10rem]" />
        </Link>
        <p className="eyebrow mt-16">{t("auth.checkEmail.eyebrow")}</p>
        <h1 className="page-title">{t("auth.checkEmail.title")}</h1>
        <p className="mt-5 text-base leading-7 text-black/65">
          {t("auth.checkEmail.description")}
        </p>

        {sent && <p className="notice notice-success mt-7" role="status">{t("auth.checkEmail.sent")}</p>}
        {error && <p className="notice notice-error mt-7" role="alert">{t("auth.checkEmail.error")}</p>}

        <form action={resendVerificationEmail} className="mt-10 space-y-4 border-t border-black/10 pt-8">
          <label htmlFor="verification-email" className="block text-sm font-medium text-primary">
            {t("auth.checkEmail.address")}
            <input id="verification-email" name="email" type="email" autoComplete="email" required className="field mt-2 w-full" placeholder="you@example.com" />
          </label>
          <p className="-mt-2 text-xs leading-5 text-black/50">{t("auth.checkEmail.hint")}</p>
          <button type="submit" className="btn-primary w-full">{t("auth.checkEmail.again")}</button>
        </form>
        <p className="mt-7 text-center text-sm text-black/55">
          {t("auth.checkEmail.return")} <Link href="/sign-in" className="font-medium text-brand hover:underline">{t("auth.checkEmail.signIn")}</Link>
        </p>
      </div>
      <PublicFooter className="mx-auto mt-12 w-full max-w-md" />
    </main>
  );
}
