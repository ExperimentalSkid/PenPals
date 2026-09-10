import PublicInfoPage from "@/app/components/PublicInfoPage";
import { getPageI18n, resolveLocale } from "@/i18n/server";
import { localizedPublicMetadata } from "@/lib/seo/localized-metadata";

export async function generateMetadata() {
  const locale = await resolveLocale();
  return localizedPublicMetadata(locale, "/guidelines", {
    en: { title: "Community Guidelines | pen-pals.net", description: "The community rules for friendship, safety, respectful contact, and moderation on pen-pals.net." },
    es: { title: "Normas de la comunidad | pen-pals.net", description: "Las normas de la comunidad sobre amistad, seguridad, contacto respetuoso y moderación en pen-pals.net." },
  });
}

export default async function GuidelinesPage() {
  const { t } = await getPageI18n();
  const sections = ["friendship", "adults", "respect", "sexual", "spam", "identity", "privacy", "reporting", "enforcement"] as const;
  return (
    <PublicInfoPage eyebrow={t("guidelines.eyebrow")} title={t("guidelines.title")} intro={t("guidelines.intro")}>
      <div className="space-y-8 text-muted">
        <section className="rounded-2xl border border-[#D9D3C8] bg-white/55 p-5 shadow-[0_8px_24px_rgba(16,42,67,.035)] sm:p-6">
          <p className="section-description sm:text-base">{t("guidelines.summary")}</p>
        </section>
        {sections.map((key, index) => (
          <section key={key}>
            <p className="eyebrow">{String(index + 1).padStart(2, "0")}</p>
            <h2 className="section-title-large mt-2">{t(`guidelines.sections.${key}Title`)}</h2>
            <p className="section-description mt-4 max-w-3xl whitespace-pre-line sm:text-base">{t(`guidelines.sections.${key}Body`)}</p>
          </section>
        ))}
      </div>
    </PublicInfoPage>
  );
}
