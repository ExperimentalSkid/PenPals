import Link from "next/link";
import PublicInfoPage from "@/app/components/PublicInfoPage";
import { getPageI18n, resolveLocale } from "@/i18n/server";
import { localizedPublicMetadata } from "@/lib/seo/localized-metadata";
import { localizedPublicPath } from "@/lib/seo/public";

export async function generateMetadata() {
  const locale = await resolveLocale();
  return localizedPublicMetadata(locale, "/privacy", {
    en: { title: "Privacy & data rights | pen-pals.net", description: "How pen-pals.net handles account data, profile data, conversations, privacy controls, exports, deletion, and data-rights requests." },
    es: { title: "Privacidad y derechos sobre tus datos | pen-pals.net", description: "Cómo pen-pals.net gestiona datos de cuenta y perfil, conversaciones, controles de privacidad, exportaciones, eliminación y solicitudes de derechos de datos." },
  });
}

export default async function PrivacyPage() {
  const { locale, t } = await getPageI18n();
  const cards = ["account", "profile", "communication", "safety"] as const;
  return (
    <PublicInfoPage eyebrow={t("privacy.eyebrow")} title={t("privacy.title")} intro={t("privacy.intro")}>
      <div className="space-y-8 text-muted">
        <section className="rounded-2xl border border-[#D9D3C8] bg-white/55 p-5 shadow-[0_8px_24px_rgba(16,42,67,.035)] sm:p-6">
          <p className="text-sm leading-7">{t("privacy.updated")}</p>
          <p className="section-description mt-4 sm:text-base">{t("privacy.summary")}</p>
        </section>
        <section>
          <h2 className="section-title-large">{t("privacy.dataTitle")}</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {cards.map((key) => <article key={key} className="rounded-2xl border border-[#D9D3C8] bg-white/45 p-5"><h3 className="text-sm font-semibold text-[#102A43]">{t(`privacy.cards.${key}Title`)}</h3><p className="mt-2 text-sm leading-6">{t(`privacy.cards.${key}Body`)}</p></article>)}
          </div>
        </section>
        <section><h2 className="section-title-large">{t("privacy.contactDataTitle")}</h2><p className="section-description mt-4 max-w-3xl sm:text-base">{t("privacy.contactDataBody")}</p></section>
        <section><h2 className="section-title-large">{t("privacy.contactPurposeTitle")}</h2><p className="section-description mt-4 max-w-3xl sm:text-base">{t("privacy.contactPurposeBody")}</p></section>
        <section><h2 className="section-title-large">{t("privacy.contactRetentionTitle")}</h2><p className="section-description mt-4 max-w-3xl sm:text-base">{t("privacy.contactRetentionBody")}</p></section>
        <section><h2 className="section-title-large">{t("privacy.visibilityTitle")}</h2><p className="section-description mt-4 max-w-3xl sm:text-base">{t("privacy.visibilityBody")}</p></section>
        <section><h2 className="section-title-large">{t("privacy.statsTitle")}</h2><p className="section-description mt-4 max-w-3xl sm:text-base">{t("privacy.statsBody")}</p></section>
        <section>
          <h2 className="section-title-large">{t("privacy.manageTitle")}</h2>
          <p className="section-description mt-4 max-w-3xl sm:text-base">{t("privacy.exportBody")}</p>
          <p className="section-description mt-4 max-w-3xl sm:text-base">{t("privacy.deleteBody")}</p>
          <div className="mt-5 flex flex-wrap gap-3"><Link href="/sign-in" className="btn-primary">{t("privacy.manageButton")}</Link><Link href={localizedPublicPath("/contact", locale)} className="btn-secondary">{t("privacy.contactButton")}</Link></div>
        </section>
        <section><h2 className="section-title-large">{t("privacy.rightsTitle")}</h2><p className="section-description mt-4 max-w-3xl sm:text-base">{t("privacy.rightsBody")}</p></section>
        <section className="rounded-2xl border border-[#D9D3C8] bg-[#E7F1FA]/55 p-5 sm:p-6"><h2 className="section-title-large">{t("privacy.contactTitle")}</h2><p className="section-description mt-4 sm:text-base">{t("privacy.contactBody")}</p><Link href={localizedPublicPath("/contact", locale)} className="mt-5 inline-flex btn-primary">{t("privacy.contactButton")}</Link></section>
      </div>
    </PublicInfoPage>
  );
}
