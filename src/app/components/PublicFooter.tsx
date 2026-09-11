import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPageI18n } from "@/i18n/server";
import LanguageSwitcher from "./LanguageSwitcher";
import { localizedPublicPath } from "@/lib/seo/public";

export default async function PublicFooter({ className = "", showLanguageSwitcher = true }: { className?: string; showLanguageSwitcher?: boolean }) {
  const db = await createClient();
  const [{ data }, { locale, t }] = await Promise.all([db.auth.getClaims(), getPageI18n()]);
  const signedIn = Boolean(data?.claims?.sub);

  return (
    <footer className={`border-t border-[#D9D3C8] py-7 text-sm text-muted ${className}`}>
      <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2" aria-label={t("common.publicLinks")}>
        <Link href={localizedPublicPath("/faq", locale)} className="font-medium text-[#073A73] underline-offset-4 hover:underline">{t("common.faq")}</Link>
        <Link href={localizedPublicPath("/privacy", locale)} className="font-medium text-[#073A73] underline-offset-4 hover:underline">{t("common.privacy")}</Link>
        <Link href={localizedPublicPath("/terms", locale)} className="font-medium text-[#073A73] underline-offset-4 hover:underline">{t("common.terms")}</Link>
        <Link href={localizedPublicPath("/guidelines", locale)} className="font-medium text-[#073A73] underline-offset-4 hover:underline">{t("common.guidelines")}</Link>
        <Link href={localizedPublicPath("/gdpr", locale)} className="font-medium text-[#073A73] underline-offset-4 hover:underline">{t("common.gdpr")}</Link>
        {!signedIn && <Link href={localizedPublicPath("/contact", locale)} className="font-medium text-[#073A73] underline-offset-4 hover:underline">{t("common.contact")}</Link>}
        {showLanguageSwitcher && <LanguageSwitcher locale={locale} label={t("common.language")} />}
      </nav>
    </footer>
  );
}
