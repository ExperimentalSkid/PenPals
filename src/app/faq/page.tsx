import Link from "next/link";
import PublicInfoPage from "@/app/components/PublicInfoPage";
import { getPageI18n, resolveLocale } from "@/i18n/server";
import { localizedPublicMetadata } from "@/lib/seo/localized-metadata";
import { localizedPublicPath } from "@/lib/seo/public";

export async function generateMetadata() {
  const locale = await resolveLocale();
  return localizedPublicMetadata(locale, "/faq", {
    en: { title: "FAQ | pen-pals.net", description: "Answers to common questions about Pen-Pals.net, international friendship, introductions, messaging, Snail Mail, verification, privacy, safety, and account controls." },
    es: { title: "Preguntas frecuentes | pen-pals.net", description: "Respuestas a preguntas frecuentes sobre Pen-Pals.net, amistad internacional, presentaciones, mensajes, Snail Mail, verificación, privacidad, seguridad y controles de cuenta." },
  });
}

const sectionSpecs = [
  ["about", 4],
  ["meeting", 5],
  ["messaging", 5],
  ["profiles", 5],
  ["safety", 6],
  ["account", 5],
] as const;

export default async function FaqPage() {
  const { locale, t } = await getPageI18n();
  const faqSections = sectionSpecs.map(([key, count]) => ({
    key,
    title: t(`faq.sections.${key}.title`),
    items: Array.from({ length: count }, (_, index) => ({
      question: t(`faq.sections.${key}.items.${index + 1}.q`),
      answer: t(`faq.sections.${key}.items.${index + 1}.a`),
    })),
  }));
  const faqStructuredData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqSections.flatMap((section) => section.items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    }))),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData).replace(/</g, "\\u003c") }} />
      <PublicInfoPage eyebrow={t("faq.eyebrow")} title={t("faq.title")} intro={t("faq.intro")}>
        <section className="relative mb-10 overflow-hidden rounded-2xl border border-[#D9D3C8] bg-[#FFF9EA] p-5 text-center shadow-[0_8px_24px_rgba(16,42,67,.035)] sm:p-6">
          <img src="https://www.ipf.net.au/images/internationalpenfriends-logo.jpg" alt="" aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 z-0 w-[260px] max-w-[70%] -translate-x-1/2 -translate-y-1/2 opacity-[0.06]" />
          <p className="eyebrow relative z-10">{t("faq.historyEyebrow")}</p>
          <h2 className="relative z-10 mt-2 font-serif text-2xl text-[#102A43]">{t("faq.historyTitle")}</h2>
          <div className="relative z-10 mx-auto mt-4 max-w-[72ch] space-y-3 text-pretty text-center text-sm leading-7 text-muted sm:text-base">
            <p>{t("faq.history1")}</p>
            <p>{t("faq.history2")}</p>
            <p>{t("faq.history3")}</p>
            <p>{t("faq.history4")}<br /><a href="https://www.ipf.net.au/" target="_blank" rel="noopener noreferrer" className="font-semibold text-brand underline decoration-[#087456]/30 underline-offset-4 hover:decoration-[#087456]">{t("faq.historyLink")}</a>.</p>
          </div>
        </section>

        <div className="space-y-10">
          {faqSections.map((section) => (
            <section key={section.key}>
              <h2 className="mb-4 font-serif text-3xl text-[#102A43]">{section.title}</h2>
              <div className="grid gap-3">
                {section.items.map((item) => (
                  <details key={item.question} className="rounded-2xl border border-[#D9D3C8] bg-white/55 shadow-[0_8px_24px_rgba(16,42,67,.025)]">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-5 p-5 sm:p-6">
                      <span className="font-serif text-xl text-[#102A43] sm:text-2xl">{item.question}</span>
                      <span aria-hidden="true" className="shrink-0 text-2xl font-light leading-none text-brand">+</span>
                    </summary>
                    <div className="border-t border-[#D9D3C8]/70 px-5 pb-5 pt-4 text-sm leading-7 text-muted sm:px-6 sm:pb-6 sm:text-base">{item.answer}</div>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>

        <section className="mt-10 rounded-2xl border border-[#D9D3C8] bg-[#E7F1FA]/55 p-5 sm:p-6">
          <h2 className="section-title">{t("faq.helpTitle")}</h2>
          <p className="mt-3 text-sm leading-7 text-muted sm:text-base">{t("faq.helpBody")}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href={localizedPublicPath("/contact", locale)} className="btn-primary">{t("faq.contact")}</Link>
            <Link href={localizedPublicPath("/privacy", locale)} className="btn-secondary">{t("faq.privacy")}</Link>
          </div>
        </section>
      </PublicInfoPage>
    </>
  );
}
