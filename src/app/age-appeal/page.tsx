import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { submitAgeAppeal } from "./actions";
import PublicFooter from "@/app/components/PublicFooter";
import { getPageI18n } from "@/i18n/server";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AgeAppeal({ searchParams }: { searchParams: Promise<{ error?: string; submitted?: string }> }) {
  const query = await searchParams;
  const db = await createClient();
  const [{ data }, { locale, t }] = await Promise.all([db.auth.getClaims(), getPageI18n()]);
  const authenticated = Boolean(data?.claims?.sub);
  return <main lang={locale} className="mx-auto w-full max-w-xl px-6 py-16 text-primary sm:py-24">
    <Link href="/sign-in" className="text-sm font-medium text-brand hover:underline">{t("auth.age.back")}</Link>
    <p className="eyebrow mt-12">{t("auth.age.eyebrow")}</p>
    <h1 className="page-title">{t("auth.age.title")}</h1>
    <p className="mt-5 max-w-lg text-base leading-7 text-black/60">{t("auth.age.description")}</p>
    {!authenticated && <p className="mt-8 border-l-2 border-black/15 px-3 py-2 text-sm text-black/60">{t("auth.age.signinHint")}</p>}
    {query.error && <p className="notice notice-error mt-8" role="alert">{query.error}</p>}
    {query.submitted ? <p className="mt-8 border-l-2 border-[#087456] px-3 py-2 text-sm text-brand">{t("auth.age.submitted")}</p> : authenticated && <form action={submitAgeAppeal} className="mt-10 space-y-6 border-t border-black/10 pt-8">
      <label className="block text-sm font-medium">{t("auth.age.birth")}<input name="corrected_birth_date" type="date" required className="field mt-2 w-full" /></label>
      <label className="block text-sm font-medium">{t("auth.age.explanation")} <span className="font-normal text-black/45">({t("common.optional")})</span><textarea name="explanation" maxLength={500} rows={4} className="field mt-2 w-full" placeholder={t("auth.age.placeholder")} /></label>
      <button className="btn-primary px-5 py-3">{t("auth.age.submit")}</button>
    </form>}
    <PublicFooter className="mt-12" />
  </main>;
}
