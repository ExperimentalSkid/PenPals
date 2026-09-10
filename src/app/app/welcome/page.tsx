import Link from "next/link";
import { redirect } from "next/navigation";
import BrandLogo from "@/app/components/BrandLogo";
import LanguageSwitcher from "@/app/components/LanguageSwitcher";
import { createClient } from "@/lib/supabase/server";
import { getPageI18n } from "@/i18n/server";
import { completeWelcome } from "./actions";

export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { locale, t } = await getPageI18n();
  const db = await createClient();
  const { data: claims } = await db.auth.getClaims();
  const uid = claims?.claims?.sub;
  if (!uid) redirect("/sign-in");
  const [{ data: profile, error: profileError }, params] = await Promise.all([
    db.from("profiles").select("display_name,onboarding_welcome_completed_at").eq("id", uid).maybeSingle(),
    searchParams,
  ]);
  if (profileError || !profile) redirect("/app/profile/setup");
  if (profile.onboarding_welcome_completed_at) redirect("/app/discover");

  const rules = ["friendship", "adult", "boundaries", "sexual", "spam", "safety"] as const;
  return <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-5 py-8 sm:px-8 sm:py-12">
    <div className="flex items-center justify-between gap-4"><BrandLogo variant="wordmark" loading="eager" className="h-auto w-[9.5rem]" /><LanguageSwitcher locale={locale} label={t("common.language")} /></div>
    <section className="mt-10 rounded-3xl border border-[#d9d3c8] bg-[#fffdfa]/90 p-6 shadow-[0_18px_50px_rgba(16,42,67,.06)] sm:p-10">
      <p className="eyebrow">{t("welcome.eyebrow")}</p>
      <h1 className="page-title mt-3">{t("welcome.title", { name: profile?.display_name || t("welcome.friend") })}</h1>
      <p className="mt-4 max-w-2xl text-base leading-7 text-black/60 sm:text-lg">{t("welcome.intro")}</p>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">{rules.map((key) => <article key={key} className="rounded-2xl border border-[#ded8cd] bg-white/65 p-5"><h2 className="font-semibold text-primary">{t(`welcome.rules.${key}Title`)}</h2><p className="mt-2 text-sm leading-6 text-black/55">{t(`welcome.rules.${key}Body`)}</p></article>)}</div>
      <div className="mt-8 rounded-2xl bg-[#eef3ee] p-5"><h2 className="font-semibold text-primary">{t("welcome.controlsTitle")}</h2><p className="mt-2 text-sm leading-6 text-black/60">{t("welcome.controlsBody")}</p></div>
      <p className="mt-6 text-sm leading-6 text-black/50">{t("welcome.readMore")} <Link href="/guidelines" className="font-medium text-brand underline underline-offset-4">{t("common.guidelines")}</Link> · <Link href="/terms" className="font-medium text-brand underline underline-offset-4">{t("common.terms")}</Link> · <Link href="/privacy" className="font-medium text-brand underline underline-offset-4">{t("common.privacy")}</Link></p>
      {params.error && <p role="alert" className="notice notice-error mt-6">{t("welcome.error")}</p>}
      <form action={completeWelcome} className="mt-8"><button type="submit" className="btn-primary min-h-12 w-full justify-center sm:w-auto sm:px-8">{t("welcome.continue")}</button></form>
    </section>
  </main>;
}
