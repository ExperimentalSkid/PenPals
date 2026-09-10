import type { ReactNode } from "react";
import Link from "next/link";
import BrandLogo from "./BrandLogo";
import PublicFooter from "./PublicFooter";
import LanguageSwitcher from "./LanguageSwitcher";
import { getPageI18n } from "@/i18n/server";
import { localizedPublicPath } from "@/lib/seo/public";

export default async function PublicInfoPage({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro: string; children: ReactNode }) {
  const { locale, t } = await getPageI18n();
  return (
    <main lang={locale} className="min-h-screen bg-[#f7f5ef] px-6 py-8 text-[#102A43] sm:px-10">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-5xl flex-col">
        <nav className="flex items-center justify-between gap-4">
          <Link href={localizedPublicPath("/", locale)} aria-label={t("common.homeAria")} className="inline-flex items-center">
            <BrandLogo variant="wordmark" priority className="h-auto w-[9.5rem]" />
          </Link>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <LanguageSwitcher locale={locale} label={t("common.language")} />
            <Link href="/sign-in" className="rounded-full px-4 py-2 text-[#102A43] hover:bg-white">{t("common.signIn")}</Link>
            <Link href="/sign-up" className="rounded-full bg-[#073A73] px-5 py-2.5 text-white shadow-sm hover:bg-[#052D59]">{t("common.join")}</Link>
          </div>
        </nav>
        <header className="border-b border-[#D9D3C8] pb-10 pt-16 sm:pt-20">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="page-title">{title}</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-muted">{intro}</p>
        </header>
        <div className="flex-1 py-10">{children}</div>
        <PublicFooter />
      </div>
    </main>
  );
}
