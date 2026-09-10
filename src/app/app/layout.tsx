import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import PresenceProvider from "@/app/PresenceProvider";
import AppNavigation from "./AppNavigation";
import { ACTIONABLE_NOTIFICATION_TYPES } from "./notificationTypes";
import BrandLogo from "@/app/components/BrandLogo";
import LanguageSwitcher from "@/app/components/LanguageSwitcher";
import { hasCompletedProfile } from "@/lib/profile-completeness";
import { NextIntlClientProvider } from "next-intl";
import { getPageI18n } from "@/i18n/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

type UnreadNotificationRow = { type: string; related_id: string | null };
type IntroductionState = { id: string; status: string | null; recipient_id: string | null };

function SignOutIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /><path d="M13 4h7v16h-7" /></svg>;
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { locale, messages, t } = await getPageI18n();
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  const uid = data?.claims?.sub;
  if (!uid) redirect("/sign-in");
  // Supabase may issue a session for an unconfirmed signup (for example when
  // local Auth confirmation settings have not been reloaded yet). Keep the
  // application boundary authoritative by checking the user record here too.
  const { data: userData } = await db.auth.getUser();
  if (!userData.user?.email_confirmed_at) redirect("/check-email");
  const { data: ageRestricted, error: ageRestrictionError } = await db.rpc("is_current_user_age_restricted");
  if (ageRestrictionError) redirect("/sign-in?error=Account%20unavailable");
  if (ageRestricted) redirect("/age-appeal");
  const { data: p, error: profileError } = await db.from("profiles").select("username,display_name,role,deactivated_at,require_login_mfa").eq("id", uid).maybeSingle();
  if (profileError) redirect("/sign-in?error=Account%20unavailable");
  if (p?.deactivated_at) redirect("/reactivate");
  if (p?.require_login_mfa && String(data?.claims?.aal ?? "") !== "aal2") redirect("/auth/mfa");
  if (p?.require_login_mfa) {
    const { data: assurance, error: assuranceError } = await db.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assuranceError || assurance.currentLevel !== "aal2") redirect("/auth/mfa");
  }
  const [{ data: completionProfile, error: completionError }, { count: languageCount, error: languageError }, { count: interestCount, error: interestError }] = await Promise.all([
    db.from("profiles").select("username,display_name,birth_date,country").eq("id", uid).maybeSingle(),
    db.from("profile_languages").select("language_id", { count: "exact", head: true }).eq("profile_id", uid),
    db.from("profile_interests").select("interest_id", { count: "exact", head: true }).eq("profile_id", uid),
  ]);
  if (completionError || languageError || interestError) redirect("/sign-in?error=Account%20unavailable");
  const isBootstrapAdmin = p?.role === "admin" && p.username === "admin";
  const onboardingLocked = !isBootstrapAdmin && !hasCompletedProfile(completionProfile ?? {}, languageCount ?? 0, interestCount ?? 0);
  // Incomplete members get a deliberately quiet shell while the proxy keeps
  // every non-setup URL out of the normal app. This prevents the global
  // sidebar/content from distracting users during the gateway without
  // changing the completed-profile editing experience.
  if (onboardingLocked) return <NextIntlClientProvider locale={locale} messages={messages}><div lang={locale} className="min-h-screen bg-[#f7f5ef]">{children}</div></NextIntlClientProvider>;
  // This is idempotent and only emits the existing actionable notification
  // once when a profile enters its TOTP re-verification grace period.
  await db.rpc("maybe_notify_profile_totp_reverification");
  const { data: unreadCountRpc } = await db.rpc("unread_notification_count");
  // Keep the shell badge correct even while an older database migration is
  // rolling out. Handled introduction requests are retained for history but
  // must not count as actionable notifications after a reply or decline.
  let unreadCount = Number(unreadCountRpc ?? 0);
  const { data: unreadRows, error: unreadRowsError } = await db
    .from("notifications")
    .select("type,related_id")
    .eq("user_id", uid)
    .is("read_at", null)
    .in("type", [...ACTIONABLE_NOTIFICATION_TYPES]);
  if (!unreadRowsError) {
    const introductionIds = (unreadRows ?? [])
      .filter((row: UnreadNotificationRow) => row.type === "new_introduction")
      .map((row: UnreadNotificationRow) => row.related_id)
      .filter((id: string | null): id is string => Boolean(id));
    const { data: introductions } = introductionIds.length
      ? await db.from("conversation_introductions").select("id,status,recipient_id").in("id", introductionIds)
      : { data: [] };
    const introductionState = new Map((introductions ?? []).map((row: IntroductionState) => [row.id, row]));
    unreadCount = (unreadRows as UnreadNotificationRow[] ?? []).filter((row: UnreadNotificationRow) => {
      if (row.type !== "new_introduction") return true;
      const introduction = introductionState.get(row.related_id ?? "");
      return introduction?.status === "pending" && introduction.recipient_id === uid;
    }).length;
  }
  const role = p?.role as "admin" | "moderator" | "user" | null | undefined;
  const { data: staffSummary } = role === "admin" || role === "moderator"
    ? await db.rpc("admin_dashboard_summary")
    : { data: null };
  const { data: supportInboxCount } = role === "admin" || role === "moderator"
    ? await db.rpc("staff_support_open_count")
    : { data: null };
  const { data: contactInboxCount } = role === "admin" || role === "moderator"
    ? await db.rpc("staff_contact_open_count")
    : { data: null };
  const modInboxCount = ["new_cases", "triage_cases", "investigating_cases", "waiting_cases"]
    .reduce((total, key) => total + Number(staffSummary?.[key] ?? 0), 0);
  const initial = (p?.display_name ?? p?.username ?? "P").trim().charAt(0).toUpperCase() || "P";

  return <NextIntlClientProvider locale={locale} messages={messages}><PresenceProvider userId={uid}><div lang={locale} className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
    <aside className="app-sidebar">
      <Link href="/app/discover" aria-label={t("common.homeAria")} className="app-sidebar-logo"><BrandLogo variant="wordmark" loading="eager" className="h-auto w-[9.5rem]" /></Link>
      {/* Staff routes remain deep-linkable: href="/app/admin/cases" is rendered by AppNavigation. */}
      <AppNavigation unreadCount={Number(unreadCount ?? 0)} modInboxCount={modInboxCount} supportInboxCount={Number(supportInboxCount ?? 0)} contactInboxCount={Number(contactInboxCount ?? 0)} role={role} />
      <div className="app-user-block">
        <Link href="/app/profile/setup" className="app-user-link">
          <span className="app-user-avatar" aria-hidden="true">{initial}</span>
          <span className="min-w-0"><span className="block truncate text-sm font-semibold text-primary">{p?.display_name ?? t("app.shell.yourProfile")}</span><span className="block truncate text-xs text-black/50">@{p?.username ?? t("app.shell.member")}</span></span>
        </Link>
        <div className="mt-3 flex justify-center border-t border-black/10 pt-3"><LanguageSwitcher locale={locale} label={t("common.language")} /></div>
        <form action={signOut} className="mt-3 border-t border-black/10 pt-3"><button className="app-signout" type="submit"><SignOutIcon /><span>{t("app.shell.signOut")}</span></button></form>
        <div className="mt-3 flex items-center justify-center gap-2 border-t border-black/5 pt-3 text-[11px] text-black/40">
          <Link href="/privacy" className="transition hover:text-[#073A73] hover:underline">{t("app.shell.privacy")}</Link>
          <span aria-hidden="true">·</span>
          <Link href="/gdpr" className="transition hover:text-[#073A73] hover:underline">{t("app.shell.gdpr")}</Link>
          <span aria-hidden="true">·</span>
          <Link href="/faq" className="transition hover:text-[#073A73] hover:underline">{t("app.shell.faq")}</Link>
        </div>
      </div>
    </aside>
    <div className="min-w-0"><div className="app-mobile-header"><div className="flex items-center justify-between gap-3"><Link href="/app/discover" aria-label={t("common.homeAria")} className="app-mobile-logo"><BrandLogo variant="wordmark" loading="eager" className="h-auto w-[8.5rem]" /></Link><Link href="/app/profile/setup" className="app-mobile-profile" aria-label={t("app.shell.openProfile")}>{initial}</Link></div><AppNavigation unreadCount={Number(unreadCount ?? 0)} modInboxCount={modInboxCount} supportInboxCount={Number(supportInboxCount ?? 0)} contactInboxCount={Number(contactInboxCount ?? 0)} role={role} mobile /></div>{children}</div>
  </div></PresenceProvider></NextIntlClientProvider>;
}
