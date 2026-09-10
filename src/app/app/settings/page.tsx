import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { savePrivacy, saveCommunicationPreferences } from "@/app/app/profile/actions";
import AccountActions from "./AccountActions";
import { deleteAccount, disconnectGoogleLogin, disconnectVerification } from "@/app/app/settings/data-actions";
import { changePassword, signOutOtherSessions, startGoogleLink } from "@/app/auth/actions";
import { COUNTRY_OPTIONS } from "@/lib/countries";
import CountryExclusionPicker from "./CountryExclusionPicker";
import TotpVerificationPanel from "./TotpVerificationPanel";
import { approvedExternalVerificationProviders } from "@/lib/verification/registry";
import { isCurrentVerification, needsVerificationRefresh, verificationDisplayState } from "@/lib/verification/display";
import { getPageI18n } from "@/i18n/server";

type VerificationRecord = {
  provider?: string;
  status?: string | null;
  revoked_at?: string | null;
  reverify_after?: string | null;
};

type TotpVerificationStatus = {
  enrolled: boolean;
  state: "not-enrolled" | "verified" | "grace" | "expired" | "inactive";
  factor_id?: string | null;
  reverify_after?: string | null;
  grace_until?: string | null;
  badge_visible?: boolean;
};

function providerLabel(provider: string) {
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

export default async function Settings({ searchParams }: { searchParams: Promise<{ error?: string; verification?: string; communication?: string; login?: string; security?: string }> }) {
  const { locale, t } = await getPageI18n();
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  const uid = data?.claims?.sub;
  if (!uid) redirect("/sign-in");
  const { error, verification, communication, login, security } = await searchParams;
  const { data: p, error: profileError } = await db.from("profiles").select("username,role,profile_visibility,show_city,show_activity_status,show_response_rate,accepting_new_conversations,introduction_scope,deactivated_at,availability,inactive_mode,allow_instant_messages,allow_snail_mail").eq("id", uid).maybeSingle();
  const { data: excluded, error: excludedError } = await db.from("profile_introduction_country_exclusions").select("country_code").eq("profile_id", uid);
  if (profileError || excludedError || !p) {
    return (
      <main lang={locale} className="min-h-screen w-full bg-[#f7f5ef] px-6 py-10 text-primary lg:px-12">
        <div className="mx-auto w-full max-w-3xl">
          <Link href="/app" className="text-sm font-medium text-brand hover:underline">← {t("app.settings.back")}</Link>
          <p className="eyebrow mt-12">{t("app.settings.eyebrow")}</p>
          <h1 className="page-title">{t("app.settings.title")}</h1>
          <div className="mt-8 border-l-2 border-[#087456] px-4 py-3" role="alert" aria-live="assertive">
            <p className="text-sm font-medium text-primary">{t("app.settings.loadError")}</p>
            <p className="section-description mt-1">{t("app.settings.loadErrorBody")}</p>
          </div>
          <Link href="/app/settings" className="mt-6 inline-flex rounded-md border border-black/15 px-4 py-2.5 text-sm font-medium text-brand hover:border-[#075d46]">{t("app.settings.tryAgain")}</Link>
        </div>
      </main>
    );
  }
  const excludedCodes = new Set((excluded ?? []).map((row: { country_code: string }) => row.country_code));
  await db.rpc("maybe_notify_profile_totp_reverification");
  const { data: totpStatusData } = await db.rpc("get_my_profile_totp_status");
  const totpStatus: TotpVerificationStatus = totpStatusData && typeof totpStatusData === "object" && !Array.isArray(totpStatusData)
    ? {
        enrolled: totpStatusData.enrolled === true,
        state: ["not-enrolled", "verified", "grace", "expired", "inactive"].includes(totpStatusData.state) ? totpStatusData.state : "not-enrolled",
        factor_id: typeof totpStatusData.factor_id === "string" ? totpStatusData.factor_id : null,
        reverify_after: typeof totpStatusData.reverify_after === "string" ? totpStatusData.reverify_after : null,
        grace_until: typeof totpStatusData.grace_until === "string" ? totpStatusData.grace_until : null,
        badge_visible: totpStatusData.badge_visible === true,
      }
    : { enrolled: false, state: "not-enrolled" };
  const { data: verificationSupplement } = await db.rpc("get_my_data_export_supplement");
  const verificationRecords: VerificationRecord[] = verificationSupplement && typeof verificationSupplement === "object" && !Array.isArray(verificationSupplement) && Array.isArray((verificationSupplement as { external_verification?: unknown }).external_verification)
    ? ((verificationSupplement as { external_verification: unknown[] }).external_verification.filter((record): record is VerificationRecord => Boolean(record) && typeof record === "object" && !Array.isArray(record)))
    : [];
  const activeVerification = verificationRecords.filter((record) => typeof record.provider === "string" && !record.revoked_at);
  const now = new Date();
  const validVerification = activeVerification.find((record) => isCurrentVerification(record, now));
  const needsRefresh = activeVerification.find((record) => needsVerificationRefresh(record, now));
  const ineligibleVerification = activeVerification.find((record) => record.status === "linked_not_eligible");
  const verificationState = verificationDisplayState(activeVerification, now);
  const activeProvider = (validVerification ?? needsRefresh ?? ineligibleVerification)?.provider as string | undefined;
  const enabledProviders = (await Promise.all(Object.keys(approvedExternalVerificationProviders).map(async (provider) => {
    try {
      const { getEnabledVerificationPolicy } = await import("@/lib/verification/server");
      return (await getEnabledVerificationPolicy(provider)) ? provider : null;
    } catch {
      return null;
    }
  }))).filter((provider): provider is string => Boolean(provider));
  const { data: identityData, error: identityError } = await db.auth.getUserIdentities();
  const googleLoginConnected = !identityError && identityData.identities.some((identity) => identity.provider === "google");
  return (
    <main lang={locale} className="min-h-screen w-full bg-[#f7f5ef] px-5 py-8 text-primary sm:px-8 sm:py-10 lg:px-12 lg:py-12">
      <div className="mx-auto w-full max-w-6xl">
        <Link href="/app" className="text-sm font-medium text-brand hover:underline">← {t("app.settings.back")}</Link>
        <header className="mt-10 max-w-3xl">
          <p className="eyebrow">{t("app.settings.eyebrow")}</p>
          <h1 className="page-title">{t("app.settings.title")}</h1>
          <p className="page-description">{t("app.settings.intro")}</p>
        </header>
        {error && <p className="notice notice-error mt-6" role="alert">{error}</p>}
        {verification && <p className="notice notice-success mt-6" role="status">{verification === "verified" ? t("app.settings.verified") : verification === "not-eligible" ? t("app.settings.notEligible") : verification === "disconnected" ? t("app.settings.verificationDisconnected") : t("app.settings.verificationUnavailable")}</p>}
        {communication === "saved" && <p className="notice notice-success mt-6" role="status">{t("app.settings.communicationSaved")}</p>}
        {login && <p className="notice notice-success mt-6" role={login === "error" || login === "unavailable" ? "alert" : "status"}>{login === "connected" ? t("app.settings.googleConnected") : login === "disconnected" ? t("app.settings.googleDisconnected") : login === "cancelled" ? t("app.settings.googleCancelled") : login === "unavailable" ? t("app.settings.googleUnavailable") : t("app.settings.googleError")}</p>}
        {security && <p className="notice notice-success mt-6" role={security.endsWith("error") || security.includes("mismatch") || security.includes("too-short") ? "alert" : "status"}>{security === "password-updated" ? t("app.settings.passwordUpdated") : security === "sessions-revoked" ? t("app.settings.sessionsRevoked") : security === "password-too-short" ? t("app.settings.passwordTooShort") : security === "password-mismatch" ? t("app.settings.passwordMismatch") : security === "password-error" ? t("app.settings.passwordError") : t("app.settings.securityUpdated")}</p>}

        <div className="mt-10 grid gap-8 lg:grid-cols-[210px_minmax(0,1fr)] lg:items-start lg:gap-12">
          <aside className="lg:sticky lg:top-8" aria-label={t("app.settings.sections")}>
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[.18em] text-black/40 lg:sr-only">{t("app.settings.sections")}</p>
            <nav className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:block lg:space-y-1" aria-label={t("app.settings.sections")}>
              <a href="#privacy-availability" className="block rounded-lg px-3 py-2.5 text-sm font-medium text-brand transition hover:bg-white/65">{t("app.settings.privacyAvailability")}</a>
              <a href="#profile-display" className="block rounded-lg px-3 py-2.5 text-sm font-medium text-brand transition hover:bg-white/65">{t("app.settings.profileDisplay")}</a>
              <a href="#communication" className="block rounded-lg px-3 py-2.5 text-sm font-medium text-brand transition hover:bg-white/65">{t("app.settings.communication")}</a>
              <a href="#login-methods" className="block rounded-lg px-3 py-2.5 text-sm font-medium text-brand transition hover:bg-white/65">{t("app.settings.loginMethods")}</a>
              <a href="#security" className="block rounded-lg px-3 py-2.5 text-sm font-medium text-brand transition hover:bg-white/65">{t("app.settings.security")}</a>
              <a href="#verification" className="block rounded-lg px-3 py-2.5 text-sm font-medium text-brand transition hover:bg-white/65">{t("app.settings.verification")}</a>
              <Link href="/app/settings/blocked" className="block rounded-lg px-3 py-2.5 text-sm font-medium text-brand transition hover:bg-white/65">{t("app.settings.blockedUsers")}</Link>
              <a href="#your-data" className="block rounded-lg px-3 py-2.5 text-sm font-medium text-brand transition hover:bg-white/65">{t("app.settings.yourData")}</a>
              <a href="#account" className="block rounded-lg px-3 py-2.5 text-sm font-medium text-brand transition hover:bg-white/65">{t("app.settings.account")}</a>
            </nav>
          </aside>

          <div className="min-w-0 space-y-6">
            <form action={savePrivacy}>
              <input type="hidden" name="settings_loaded" value="1" />
              <input type="hidden" name="profile_visibility" value={p.profile_visibility} />
              <section id="privacy-availability" className="scroll-mt-8 rounded-2xl border border-black/10 bg-white/35 p-5 shadow-[0_8px_24px_rgba(15,23,42,.03)] sm:p-7" aria-labelledby="privacy-heading">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="eyebrow">{t("app.settings.privacyAvailability")}</p><h2 id="privacy-heading" className="section-title-large mt-2">{t("app.settings.controlReach")}</h2></div><span className="text-xs text-black/45">{t("app.settings.privateAccount")}</span></div>
                <div className="mt-6 divide-y divide-black/10">
                  <label className="flex items-center justify-between gap-6 py-4 text-sm"><span>{t("app.settings.showActivity")}</span><input type="checkbox" name="show_activity_status" defaultChecked={p?.show_activity_status} className="h-4 w-4 accent-[#087456]" /></label>
                  <fieldset className="flex flex-wrap items-center justify-between gap-4 py-4 text-sm"><legend>{t("app.settings.availability")}</legend><div className="flex flex-wrap gap-5"><label className="flex items-center gap-2"><input type="radio" name="availability" value="available" defaultChecked={(p?.availability ?? "available") === "available"} className="accent-[#087456]" /> {t("app.settings.available")}</label><label className="flex items-center gap-2"><input type="radio" name="availability" value="away" defaultChecked={p?.availability === "away"} className="accent-[#087456]" /> {t("app.settings.away")}</label></div></fieldset>
                  <label className="flex items-start justify-between gap-6 py-4 text-sm"><span><span className="font-medium">{t("app.settings.pauseParticipation")}</span><span className="mt-1 block max-w-xl text-sm leading-6 text-black/55">{t("app.settings.pauseBody")}</span></span><input type="checkbox" name="inactive_mode" defaultChecked={p?.inactive_mode === true} className="mt-0.5 h-4 w-4 accent-[#087456]" /></label>
                  <label className="flex items-center justify-between gap-6 py-4 text-sm"><span>{t("app.settings.acceptIntroductions")}</span><input type="checkbox" name="accepting_new_conversations" defaultChecked={p?.accepting_new_conversations} className="h-4 w-4 accent-[#087456]" /></label>
                  <div className="py-5"><label className="text-sm font-medium">{t("app.settings.dontAcceptFrom")}</label><p className="section-description mt-1 max-w-xl">{t("app.settings.dontAcceptBody")}</p><CountryExclusionPicker countries={COUNTRY_OPTIONS} initialSelected={Array.from(excludedCodes)} /></div>
                  <div className="pt-4"><Link href="/app/settings/blocked" className="text-sm font-medium text-brand underline underline-offset-4 hover:text-brand">{t("app.settings.manageBlocked")}</Link></div>
                </div>
              </section>

              <section id="profile-display" className="mt-6 scroll-mt-8 rounded-2xl border border-black/10 bg-white/35 p-5 shadow-[0_8px_24px_rgba(15,23,42,.03)] sm:p-7" aria-labelledby="profile-display-heading">
                <p className="eyebrow">{t("app.settings.profileDisplay")}</p><h2 id="profile-display-heading" className="section-title-large mt-2">{t("app.settings.chooseSeen")}</h2>
                <div className="mt-6 divide-y divide-black/10">
                  <label className="flex items-center justify-between gap-6 py-4 text-sm"><span>{t("app.settings.showCity")}</span><input type="checkbox" name="show_city" defaultChecked={p?.show_city} className="h-4 w-4 accent-[#087456]" /></label>
                  <label className="flex items-center justify-between gap-6 py-4 text-sm"><span>{t("app.settings.showResponseRate")}</span><input type="checkbox" name="show_response_rate" defaultChecked={p?.show_response_rate} className="h-4 w-4 accent-[#087456]" /></label>
                  <label className="flex flex-wrap items-center justify-between gap-4 py-4 text-sm"><span>{t("app.settings.introScope")}</span><select name="introduction_scope" defaultValue={p?.introduction_scope} className="field w-auto"><option value="everyone">{t("app.settings.everyone")}</option><option value="matching_preferences">{t("app.settings.matchingPreferences")}</option><option value="verified_only">{t("app.settings.verifiedOnly")}</option><option value="nobody">{t("app.settings.nobody")}</option></select></label>
                </div>
              </section>
              <div className="flex flex-wrap items-center gap-4 pt-5"><button className="btn-primary">{t("app.settings.savePrivacy")}</button><span className="text-xs text-black/45">{t("app.settings.privacyApply")}</span></div>
            </form>

            <section id="communication" className="scroll-mt-8 rounded-2xl border border-black/10 bg-white/35 p-5 shadow-[0_8px_24px_rgba(15,23,42,.03)] sm:p-7" aria-labelledby="communication-heading">
              <p className="eyebrow">{t("app.settings.communication")}</p><h2 id="communication-heading" className="section-title-large mt-2">{t("app.settings.chooseConnect")}</h2>
              <p className="section-description mt-3 max-w-2xl">{t("app.settings.communicationBody")}</p>
              <form action={saveCommunicationPreferences} className="mt-6 divide-y divide-black/10 border-y border-black/10">
                <label className="flex items-center justify-between gap-6 py-5 text-sm"><span><span className="font-medium">{t("app.settings.instantMessaging")}</span><span className="mt-1 block text-sm leading-6 text-black/55">{t("app.settings.instantBody")}</span></span><input type="checkbox" name="allow_instant_messages" defaultChecked={p?.allow_instant_messages !== false} className="h-4 w-4 accent-[#087456]" /></label>
                <label className="flex items-center justify-between gap-6 py-5 text-sm"><span><span className="font-medium">{t("app.settings.snailMail")}</span><span className="mt-1 block text-sm leading-6 text-black/55">{t("app.settings.snailBody")}</span></span><input type="checkbox" name="allow_snail_mail" defaultChecked={p?.allow_snail_mail !== false} className="h-4 w-4 accent-[#087456]" /></label>
                <div className="flex flex-wrap items-center justify-between gap-4 py-5"><p className="max-w-md text-xs leading-5 text-black/50">{t("app.settings.keepOneMode")}</p><button className="btn-primary px-4 py-2.5 text-sm">{t("app.settings.saveCommunication")}</button></div>
              </form>
            </section>

            <section id="login-methods" className="scroll-mt-8 rounded-2xl border border-black/10 bg-white/35 p-5 shadow-[0_8px_24px_rgba(15,23,42,.03)] sm:p-7" aria-labelledby="login-methods-heading">
              <p className="eyebrow">{t("app.settings.loginMethods")}</p><h2 id="login-methods-heading" className="section-title-large mt-2">{t("app.settings.signInSecurely")}</h2>
              <p className="section-description mt-3 max-w-2xl">{t("app.settings.loginBody")}</p>
              <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-y border-black/10 py-5">
                <div><p className="text-sm font-medium text-primary">Google</p><p className="mt-1 text-sm text-black/55">{identityError ? t("app.settings.loginUnavailable") : googleLoginConnected ? t("app.settings.connected") : t("app.settings.notConnected")}</p></div>
                {!identityError && (googleLoginConnected ? <form action={disconnectGoogleLogin}><button className="rounded-md border border-black/15 px-3 py-2 text-sm text-black/65 transition hover:border-black/30">{t("app.settings.disconnectGoogle")}</button></form> : <form action={startGoogleLink}><button className="rounded-md border border-[#087456] px-3 py-2 text-sm font-medium text-brand transition hover:bg-[#e7eee8]">{t("app.settings.connectGoogle")}</button></form>)}
              </div>
              {googleLoginConnected && identityData.identities.length < 2 && <p className="mt-3 text-xs leading-5 text-black/50">{t("app.settings.addLoginFirst")}</p>}
            </section>

            <section id="security" className="scroll-mt-8 rounded-2xl border border-black/10 bg-white/35 p-5 shadow-[0_8px_24px_rgba(15,23,42,.03)] sm:p-7" aria-labelledby="security-heading">
              <p className="eyebrow">{t("app.settings.security")}</p><h2 id="security-heading" className="section-title-large mt-2">{t("app.settings.protectAccount")}</h2>
              <p className="section-description mt-3 max-w-2xl">{t("app.settings.securityBody")}</p>
              <form action={changePassword} className="mt-6 max-w-xl space-y-4 border-y border-black/10 py-5">
                <label className="field-label">{t("app.settings.currentPassword")}<input name="current_password" type="password" autoComplete="current-password" required className="field mt-2 block w-full" /></label>
                <label className="field-label">{t("app.settings.newPassword")}<input name="password" type="password" autoComplete="new-password" minLength={8} required className="field mt-2 block w-full" /></label>
                <label className="field-label">{t("app.settings.confirmPassword")}<input name="password_confirmation" type="password" autoComplete="new-password" minLength={8} required className="field mt-2 block w-full" /></label>
                <button className="btn-secondary px-4 py-2.5 text-sm">{t("app.settings.changePassword")}</button>
              </form>
              <form action={signOutOtherSessions} className="mt-5"><button className="rounded-md border border-black/15 px-4 py-2.5 text-sm font-medium text-brand hover:border-[#075d46]">{t("app.settings.signOutOthers")}</button><p className="mt-2 text-xs leading-5 text-black/50">{t("app.settings.signOutOthersBody")}</p></form>
            </section>

            <section id="verification" className="scroll-mt-8 rounded-2xl border border-black/10 bg-white/35 p-5 shadow-[0_8px_24px_rgba(15,23,42,.03)] sm:p-7" aria-labelledby="verification-heading">
              <p className="eyebrow">{t("app.settings.trustPrivately")}</p><h2 id="verification-heading" className="section-title-large mt-2">{t("app.settings.verifyProfile")}</h2>
              <p className="section-description mt-3 max-w-2xl">{t("app.settings.verifyProfileBody")}</p>
              <TotpVerificationPanel status={totpStatus} />
              <div className="mt-6 border-y border-black/10 py-5">
                <p className="text-sm font-medium text-primary">{t("app.settings.externalAccount")}: {verificationState === "verified" ? t("app.settings.verified") : verificationState === "needs-refresh" ? t("app.settings.verificationNeedsRefresh") : verificationState === "ineligible" ? t("app.settings.verificationIneligible") : t("app.settings.notVerified")}</p>
                <p className="section-description mt-1 max-w-2xl">{t("app.settings.externalBody")}</p>
                {verificationState === "needs-refresh" && <p className="section-description mt-1">{t("app.settings.reconnect")}</p>}
                {verificationState === "ineligible" && <p className="section-description mt-1">{t("app.settings.requirementsFail")}</p>}
                {verificationState === "not-verified" && <p className="section-description mt-1">{t("app.settings.chooseService")}</p>}
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {(verificationState === "not-verified" || verificationState === "ineligible") && enabledProviders.map((provider) => <Link key={provider} href={`/auth/verification/${encodeURIComponent(provider)}/start`} className="rounded-md border border-black/15 px-3 py-2 text-sm font-medium text-brand transition hover:border-[#075d46]">{t("app.settings.verifyWith", { provider: providerLabel(provider) })}</Link>)}
                  {verificationState === "needs-refresh" && activeProvider && enabledProviders.includes(activeProvider) && <Link href={`/auth/verification/${encodeURIComponent(activeProvider)}/start`} className="rounded-md border border-[#087456] bg-[#087456] px-3 py-2 text-sm font-medium text-white transition hover:bg-[#075d46]">{t("app.settings.verifyAgain")}</Link>}
                  {activeProvider && <form action={disconnectVerification}><input type="hidden" name="provider" value={activeProvider} /><button className="rounded-md border border-black/15 px-3 py-2 text-sm text-black/65 transition hover:border-black/30">{t("app.settings.disconnectVerification")}</button></form>}
                  {enabledProviders.length === 0 && verificationState !== "verified" && <p className="text-sm text-black/45">{t("app.settings.noServices")}</p>}
                </div>
              </div>
            </section>

            <section id="your-data" className="scroll-mt-8 rounded-2xl border border-black/10 bg-white/35 p-5 shadow-[0_8px_24px_rgba(15,23,42,.03)] sm:p-7" aria-labelledby="data-heading">
              <p className="eyebrow">{t("app.settings.yourData")}</p><h2 id="data-heading" className="section-title-large mt-2">{t("app.settings.accessRemove")}</h2>
              <p className="section-description mt-3 max-w-2xl">{t("app.settings.dataBody")}</p>
              <a href="/app/settings/data-export" className="mt-5 inline-flex rounded-md border border-black/15 px-4 py-2.5 text-sm font-medium text-brand hover:border-[#075d46]">{t("app.settings.downloadData")}</a>
              <details className="mt-8 border-t border-black/10 pt-5">
                <summary className="cursor-pointer text-sm font-medium text-red-700">{t("app.settings.deleteAccount")}</summary>
                <p className="section-description mt-3 max-w-2xl">{t("app.settings.deleteBody")}</p>
                <form action={deleteAccount} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"><label className="flex-1 text-sm">{t("app.settings.deleteConfirm")}<input name="confirmation" required autoComplete="off" className="field mt-2 w-full" /></label><button className="rounded-md border border-red-300 px-4 py-2.5 text-sm text-red-700">{t("app.settings.deleteAccount")}</button></form>
              </details>
            </section>

            <section id="account" className="scroll-mt-8 rounded-2xl border border-red-200/70 bg-red-50/20 p-5 sm:p-7" aria-labelledby="account-heading"><p className="text-xs font-bold uppercase tracking-[.16em] text-red-700/75">{t("app.settings.account")}</p><h2 id="account-heading" className="section-title-large mt-2">{t("app.settings.accountAccess")}</h2><p className="mt-3 text-sm leading-6 text-black/60">{t("app.settings.deactivateBody")}</p><div className="mt-5"><AccountActions deactivated={Boolean(p?.deactivated_at)} isAdmin={p.role === "admin"} /></div></section>
          </div>
        </div>
      </div>
    </main>
  );
}
