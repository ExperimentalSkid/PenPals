import Link from "next/link";
import PublicInfoPage from "@/app/components/PublicInfoPage";
import { submitPublicContact } from "./actions";
import ContactSubmitButton from "./ContactSubmitButton";
import { getPageI18n, resolveLocale } from "@/i18n/server";
import { localizedPublicMetadata } from "@/lib/seo/localized-metadata";
import { localizedPublicPath } from "@/lib/seo/public";

export async function generateMetadata() {
  const locale = await resolveLocale();
  return localizedPublicMetadata(locale, "/contact", {
    en: { title: "Contact | pen-pals.net", description: "Contact pen-pals.net about account access, privacy, safety, bugs, feedback, or general questions." },
    es: { title: "Contacto | pen-pals.net", description: "Contacta con pen-pals.net sobre acceso a la cuenta, privacidad, seguridad, errores, comentarios o preguntas generales." },
  });
}

const topicValues = ["account_access", "privacy_safety", "bug_report", "feedback", "other"] as const;

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ error?: string; sent?: string; verify?: string; verified?: string; verification?: string }> }) {
  const [query, { locale, t }] = await Promise.all([searchParams, getPageI18n()]);
  const topicLabels = {
    account_access: t("contact.topics.account"),
    privacy_safety: t("contact.topics.privacy"),
    bug_report: t("contact.topics.bug"),
    feedback: t("contact.topics.feedback"),
    other: t("contact.topics.other"),
  };

  return (
    <PublicInfoPage eyebrow={t("contact.eyebrow")} title={t("contact.title")} intro={t("contact.intro")}>
      {query.verified || query.sent ? (
        <section className="rounded-2xl border border-[#D9D3C8] bg-white/55 p-6 shadow-[0_8px_24px_rgba(16,42,67,.035)]">
          <p className="eyebrow">{t("contact.sentEyebrow")}</p>
          <h2 className="section-title-large mt-2">{t("contact.sentTitle")}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-muted sm:text-base">{t("contact.sentBody")}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={localizedPublicPath("/", locale)} className="btn-primary">{t("contact.backHome")}</Link>
            <Link href={localizedPublicPath("/faq", locale)} className="btn-secondary">{t("contact.readFaq")}</Link>
          </div>
        </section>
      ) : query.verify ? (
        <section className="rounded-2xl border border-[#D9D3C8] bg-white/55 p-6 shadow-[0_8px_24px_rgba(16,42,67,.035)]">
          <p className="eyebrow">{t("contact.verifyEyebrow")}</p>
          <h2 className="section-title-large mt-2">{t("contact.verifyTitle")}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-muted sm:text-base">{t("contact.verifyBody")}</p>
          <div className="mt-6"><Link href={localizedPublicPath("/", locale)} className="btn-secondary">{t("contact.backHome")}</Link></div>
        </section>
      ) : (
        <section className="rounded-2xl border border-[#D9D3C8] bg-white/55 p-5 shadow-[0_8px_24px_rgba(16,42,67,.035)] sm:p-7">
          <div className="border-b border-[#D9D3C8] pb-5">
            <h2 className="section-title-large">{t("contact.formTitle")}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">{t("contact.warning")}</p>
          </div>
          {(query.error || query.verification) && <p className="notice notice-error mt-6" role="alert">{query.error ?? (query.verification === "expired" ? t("contact.verificationExpired") : query.verification === "failed" ? t("contact.verificationFailed") : t("contact.verificationInvalid"))}</p>}
          <form action={submitPublicContact} className="mt-6 space-y-5">
            <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
            <label className="field-label">{t("contact.name")} <span className="font-normal text-black/45">({t("common.optional")})</span><input name="name" maxLength={120} autoComplete="name" className="field mt-2 block w-full" /></label>
            <label className="field-label">{t("common.email")}<input name="email" type="email" maxLength={254} autoComplete="email" required className="field mt-2 block w-full" /></label>
            <label className="field-label">{t("contact.topic")}<select name="topic" required defaultValue="" className="field mt-2 block w-full"><option value="" disabled>{t("contact.chooseTopic")}</option>{topicValues.map((value) => <option key={value} value={value}>{topicLabels[value]}</option>)}</select></label>
            <label className="field-label">{t("contact.subject")}<input name="subject" required minLength={3} maxLength={200} className="field mt-2 block w-full" placeholder={t("contact.subjectPlaceholder")} /></label>
            <label className="field-label">{t("contact.message")}<textarea name="message" required minLength={10} maxLength={4000} rows={8} className="field mt-2 block w-full resize-y leading-7" placeholder={t("contact.messagePlaceholder")} /></label>
            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#D9D3C8] pt-5">
              <p className="max-w-md text-xs leading-5 text-black/50">{t("contact.supportHint")}</p>
              <ContactSubmitButton sendingLabel={t("contact.sending")} sendLabel={t("contact.send")} />
            </div>
          </form>
        </section>
      )}
    </PublicInfoPage>
  );
}
