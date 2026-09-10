import PublicInfoPage from "@/app/components/PublicInfoPage";
import { getPageI18n, resolveLocale } from "@/i18n/server";
import { localizedPublicMetadata } from "@/lib/seo/localized-metadata";

export async function generateMetadata() {
  const locale = await resolveLocale();
  return localizedPublicMetadata(locale, "/terms", {
    en: { title: "Terms of Service | pen-pals.net", description: "The terms that apply when you create an account or use pen-pals.net." },
    es: { title: "Términos del servicio | pen-pals.net", description: "Los términos aplicables al crear una cuenta o utilizar pen-pals.net." },
  });
}

export default async function TermsPage() {
  const { t } = await getPageI18n();
  const sections = ["eligibility", "purpose", "account", "conduct", "content", "privacy", "availability", "enforcement", "liability", "changes", "general", "contact"] as const;
  return (
    <PublicInfoPage eyebrow={t("terms.eyebrow")} title={t("terms.title")} intro={t("terms.intro")}>
      <div className="space-y-8 text-muted">
        <section className="rounded-2xl border border-[#D9D3C8] bg-white/55 p-5 shadow-[0_8px_24px_rgba(16,42,67,.035)] sm:p-6">
          <p className="text-sm leading-7">{t("terms.effective")}</p>
          <p className="section-description mt-4 sm:text-base">{t("terms.acceptance")}</p>
        </section>
        {sections.map((key, index) => (
          <section key={key}>
            <p className="eyebrow">{String(index + 1).padStart(2, "0")}</p>            <h2 className="section-title-large mt-2">{t(`terms.sections.${key}Title`)}</h2>
            <p className="section-description mt-4 max-w-3xl whitespace-pre-line sm:text-base">{t(`terms.sections.${key}Body`)}</p>
          </section>
        ))}
      </div>
    </PublicInfoPage>
  );
}
