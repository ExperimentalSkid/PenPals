import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPageI18n } from "@/i18n/server";
import BrandLogo from "@/app/components/BrandLogo";
import MfaChallenge from "./MfaChallenge";

export default async function LoginMfaPage() {
  const { locale, t } = await getPageI18n();
  const db = await createClient();
  const { data: claimsData } = await db.auth.getClaims();
  const uid = claimsData?.claims?.sub;
  if (!uid) redirect("/sign-in");
  if (String(claimsData.claims?.aal ?? "") === "aal2") redirect("/app");

  const { data: profile, error } = await db.from("profiles").select("require_login_mfa").eq("id", uid).maybeSingle();
  if (error || !profile) redirect("/sign-in?error=Account%20unavailable");
  if (!profile.require_login_mfa) redirect("/app");

  return (
    <main lang={locale} className="min-h-screen bg-[#f7f5ef] px-6 py-16 text-primary sm:py-24">
      <div className="mx-auto w-full max-w-md">
        <BrandLogo variant="wordmark" priority className="h-auto w-[10rem]" />
        <p className="eyebrow mt-16">{t("auth.mfa.eyebrow")}</p>
        <h1 className="page-title">{t("auth.mfa.title")}</h1>        <p className="mt-5 text-base leading-7 text-black/65">{t("auth.mfa.description")}</p>
        <MfaChallenge labels={{
          code: t("auth.mfa.code"),
          submit: t("auth.mfa.submit"),
          verifying: t("auth.mfa.verifying"),
          invalid: t("auth.mfa.invalid"),
          unavailable: t("auth.mfa.unavailable"),
          noFactor: t("auth.mfa.noFactor"),
          signOut: t("auth.mfa.signOut"),
        }} />
      </div>
    </main>
  );
}
