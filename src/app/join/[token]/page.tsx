import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import BrandLogo from "@/app/components/BrandLogo";
import LanguageSwitcher from "@/app/components/LanguageSwitcher";
import PublicFooter from "@/app/components/PublicFooter";
import { createClient } from "@/lib/supabase/server";
import { getPageI18n } from "@/i18n/server";
import { validMemberInviteToken } from "@/lib/auth/member-invite";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function MemberInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!validMemberInviteToken(token)) notFound();
  const { locale, t } = await getPageI18n();
  const db = await createClient();
  const { data, error } = await db.rpc("open_member_invite", { p_token: token });
  const invite = Array.isArray(data) ? data[0] : data;
  if (error || !invite?.inviter_display_name) notFound();
  const signUpHref = `/sign-up?invite=${encodeURIComponent(token)}`;
  return <main lang={locale} className="min-h-screen bg-[#f7f5ef] px-6 py-12 text-primary sm:py-20">
    <div className="mx-auto w-full max-w-md">
      <div className="flex items-center justify-between gap-4"><Link href="/" className="inline-flex items-center"><BrandLogo variant="wordmark" priority className="h-auto w-[9.5rem]" /></Link><LanguageSwitcher locale={locale} label={t("common.language")} /></div>
      <section className="mt-16 rounded-2xl border border-black/10 bg-white/45 p-7 shadow-[0_8px_24px_rgba(15,23,42,.04)]">
        <p className="eyebrow">{t("invite.eyebrow")}</p>
        <h1 className="page-title mt-2">{t("invite.title")}</h1>
        <p className="page-description mt-4">{t("invite.body", { name: String(invite.inviter_display_name) })}</p>
        <Link href={signUpHref} className="btn-primary mt-7 inline-flex w-full justify-center">{t("invite.join")}</Link>
        <p className="mt-4 text-center text-sm text-black/55">{t("invite.already")} <Link href="/sign-in" className="font-semibold text-brand underline-offset-4 hover:underline">{t("common.signIn")}</Link></p>
      </section>
      <PublicFooter className="mt-12" />
    </div>
  </main>;
}
