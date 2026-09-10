import type { Metadata } from "next";
import { reactivateAccount } from "@/app/app/profile/actions";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PublicFooter from "@/app/components/PublicFooter";
import { getPageI18n } from "@/i18n/server";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ReactivatePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const db = await createClient();
  const { data: claimsData } = await db.auth.getClaims();
  const uid = claimsData?.claims?.sub;
  if (!uid) redirect("/sign-in");
  const { data: userData } = await db.auth.getUser();
  if (!userData.user?.email_confirmed_at) redirect("/check-email");
  const { data: profile } = await db.from("profiles").select("deactivated_at").eq("id", uid).maybeSingle();
  if (!profile?.deactivated_at) redirect("/app");

  const [params, { locale, t }] = await Promise.all([searchParams, getPageI18n()]);
  return (
    <main lang={locale} className="flex min-h-screen items-center justify-center bg-[#fbfaf7] px-6 py-12 text-primary">
      <section className="w-full max-w-md border-y border-black/10 py-10">
        <p className="eyebrow">{t("auth.reactivate.eyebrow")}</p>
        <h1 className="page-title-compact">{t("auth.reactivate.title")}</h1>
        <p className="mt-4 text-sm leading-6 text-black/60">{t("auth.reactivate.description")}</p>
        {params.error && <p className="notice notice-error mt-5" role="alert">{params.error}</p>}
        <form action={reactivateAccount} className="mt-8">
          <button type="submit" className="rounded-md bg-[#087456] px-5 py-3 text-sm font-semibold text-white hover:bg-[#075d46]">{t("auth.reactivate.submit")}</button>
        </form>
      </section>
      <PublicFooter className="absolute inset-x-6 bottom-0 mx-auto max-w-md" />
    </main>
  );
}
