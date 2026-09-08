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
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  const uid = data?.claims?.sub;
  if (!uid) redirect("/sign-in");
  const { error, verification, communication, login, security } = await searchParams;
  const { data: p, error: profileError } = await db.from("profiles").select("username,role,profile_visibility,show_city,show_activity_status,show_response_rate,accepting_new_conversations,introduction_scope,deactivated_at,availability,inactive_mode,allow_instant_messages,allow_snail_mail").eq("id", uid).maybeSingle();
  const { data: excluded, error: excludedError } = await db.from("profile_introduction_country_exclusions").select("country_code").eq("profile_id", uid);
  if (profileError || excludedError || !p) {
    return (
      <main className="min-h-screen w-full bg-[#f7f5ef] px-6 py-10 text-[#16251f] lg:px-12">
        <div className="mx-auto w-full max-w-3xl">
          <Link href="/app" className="text-sm font-medium text-[#087456] hover:underline">← Back to app</Link>
          <p className="mt-12 text-xs font-bold uppercase tracking-[.2em] text-[#087456]">Preferences</p>
          <h1 className="mt-3 font-serif text-5xl tracking-[-0.02em] text-[#10231d]">Settings</h1>
          <div className="mt-8 border-l-2 border-[#087456] px-4 py-3" role="alert" aria-live="assertive">
            <p className="text-sm font-medium text-[#10231d]">We couldn&apos;t load your privacy settings.</p>
            <p className="mt-1 text-sm leading-6 text-black/60">Please refresh and try again. Your existing privacy choices were not changed.</p>
          </div>
          <Link href="/app/settings" className="mt-6 inline-flex rounded-md border border-black/15 px-4 py-2.5 text-sm font-medium text-[#075d46] hover:border-[#075d46]">Try again</Link>
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
    <main className="min-h-screen w-full bg-[#f7f5ef] px-5 py-8 text-[#16251f] sm:px-8 sm:py-10 lg:px-12 lg:py-12">
      <div className="mx-auto w-full max-w-6xl">
        <Link href="/app" className="text-sm font-medium text-[#087456] hover:underline">← Back to app</Link>
        <header className="mt-10 max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-[#087456]">Preferences</p>
          <h1 className="mt-3 font-serif text-5xl tracking-[-0.02em] text-[#10231d] sm:text-6xl">Settings</h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-black/60 sm:text-lg">Manage your preferences and account.</p>
        </header>
        {error && <p className="mt-6 border-l-2 border-red-400 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
        {verification && <p className="mt-6 border-l-2 border-[#087456] px-3 py-2 text-sm text-[#075d46]" role="status">{verification === "verified" ? "Your profile is verified." : verification === "not-eligible" ? "This account could not meet the current verification requirements." : verification === "disconnected" ? "Profile verification disconnected." : "Verification is currently unavailable."}</p>}
        {communication === "saved" && <p className="mt-6 border-l-2 border-[#087456] px-3 py-2 text-sm text-[#075d46]" role="status">Communication preferences saved.</p>}
        {login && <p className="mt-6 border-l-2 border-[#087456] px-3 py-2 text-sm text-[#075d46]" role={login === "error" || login === "unavailable" ? "alert" : "status"}>{login === "connected" ? "Google sign-in connected." : login === "disconnected" ? "Google sign-in disconnected." : login === "cancelled" ? "Google sign-in was cancelled." : login === "unavailable" ? "Google sign-in is not configured yet." : "We couldn't update Google sign-in."}</p>}
        {security && <p className="mt-6 border-l-2 border-[#087456] px-3 py-2 text-sm text-[#075d46]" role={security.endsWith("error") || security.includes("mismatch") || security.includes("too-short") ? "alert" : "status"}>{security === "password-updated" ? "Password updated." : security === "sessions-revoked" ? "Other active sessions were signed out." : security === "password-too-short" ? "Choose a password with at least 8 characters." : security === "password-mismatch" ? "New passwords do not match." : security === "password-error" ? "We couldn't update your password. Check your current password and try again." : "Security settings updated."}</p>}

        <div className="mt-10 grid gap-8 lg:grid-cols-[210px_minmax(0,1fr)] lg:items-start lg:gap-12">
          <aside className="lg:sticky lg:top-8" aria-label="Settings sections">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[.18em] text-black/40 lg:sr-only">Settings sections</p>
            <nav className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:block lg:space-y-1" aria-label="Settings sections">
              <a href="#privacy-availability" className="block rounded-lg px-3 py-2.5 text-sm font-medium text-[#075d46] transition hover:bg-white/65">Privacy &amp; availability</a>
              <a href="#profile-display" className="block rounded-lg px-3 py-2.5 text-sm font-medium text-[#075d46] transition hover:bg-white/65">Profile display</a>
              <a href="#communication" className="block rounded-lg px-3 py-2.5 text-sm font-medium text-[#075d46] transition hover:bg-white/65">Communication</a>
              <a href="#login-methods" className="block rounded-lg px-3 py-2.5 text-sm font-medium text-[#075d46] transition hover:bg-white/65">Login methods</a>
              <a href="#security" className="block rounded-lg px-3 py-2.5 text-sm font-medium text-[#075d46] transition hover:bg-white/65">Security</a>
              <a href="#verification" className="block rounded-lg px-3 py-2.5 text-sm font-medium text-[#075d46] transition hover:bg-white/65">Verification</a>
              <Link href="/app/settings/blocked" className="block rounded-lg px-3 py-2.5 text-sm font-medium text-[#075d46] transition hover:bg-white/65">Blocked users</Link>
              <a href="#your-data" className="block rounded-lg px-3 py-2.5 text-sm font-medium text-[#075d46] transition hover:bg-white/65">Your data</a>
              <a href="#account" className="block rounded-lg px-3 py-2.5 text-sm font-medium text-[#075d46] transition hover:bg-white/65">Account</a>
            </nav>
          </aside>

          <div className="min-w-0 space-y-6">
            <form action={savePrivacy}>
              <input type="hidden" name="settings_loaded" value="1" />
              <input type="hidden" name="profile_visibility" value={p.profile_visibility} />
              <section id="privacy-availability" className="scroll-mt-8 rounded-2xl border border-black/10 bg-white/35 p-5 shadow-[0_8px_24px_rgba(15,23,42,.03)] sm:p-7" aria-labelledby="privacy-heading">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#087456]">Privacy &amp; availability</p><h2 id="privacy-heading" className="mt-2 font-serif text-3xl text-[#10231d]">Control who can reach you</h2></div><span className="text-xs text-black/45">Private to your account</span></div>
                <div className="mt-6 divide-y divide-black/10">
                  <label className="flex items-center justify-between gap-6 py-4 text-sm"><span>Show my activity status</span><input type="checkbox" name="show_activity_status" defaultChecked={p?.show_activity_status} className="h-4 w-4 accent-[#087456]" /></label>
                  <fieldset className="flex flex-wrap items-center justify-between gap-4 py-4 text-sm"><legend>Availability</legend><div className="flex flex-wrap gap-5"><label className="flex items-center gap-2"><input type="radio" name="availability" value="available" defaultChecked={(p?.availability ?? "available") === "available"} className="accent-[#087456]" /> Available</label><label className="flex items-center gap-2"><input type="radio" name="availability" value="away" defaultChecked={p?.availability === "away"} className="accent-[#087456]" /> Away</label></div></fieldset>
                  <label className="flex items-start justify-between gap-6 py-4 text-sm"><span><span className="font-medium">Pause participation</span><span className="mt-1 block max-w-xl text-sm leading-6 text-black/55">Pause discovery, introductions, presence, and activity updates while keeping your account and conversations.</span></span><input type="checkbox" name="inactive_mode" defaultChecked={p?.inactive_mode === true} className="mt-0.5 h-4 w-4 accent-[#087456]" /></label>
                  <label className="flex items-center justify-between gap-6 py-4 text-sm"><span>Accept new introductions</span><input type="checkbox" name="accepting_new_conversations" defaultChecked={p?.accepting_new_conversations} className="h-4 w-4 accent-[#087456]" /></label>
                  <div className="py-5"><label className="text-sm font-medium">Don&apos;t accept introductions from</label><p className="mt-1 max-w-xl text-sm leading-6 text-black/55">People in selected countries can&apos;t send new introductions. This stays private.</p><CountryExclusionPicker countries={COUNTRY_OPTIONS} initialSelected={Array.from(excludedCodes)} /></div>
                  <div className="pt-4"><Link href="/app/settings/blocked" className="text-sm font-medium text-[#075d46] underline underline-offset-4 hover:text-[#054d3d]">Manage blocked users →</Link></div>
                </div>
              </section>

              <section id="profile-display" className="mt-6 scroll-mt-8 rounded-2xl border border-black/10 bg-white/35 p-5 shadow-[0_8px_24px_rgba(15,23,42,.03)] sm:p-7" aria-labelledby="profile-display-heading">
                <p className="text-xs font-bold uppercase tracking-[.16em] text-[#087456]">Profile display</p><h2 id="profile-display-heading" className="mt-2 font-serif text-3xl text-[#10231d]">Choose what people see</h2>
                <div className="mt-6 divide-y divide-black/10">
                  <label className="flex items-center justify-between gap-6 py-4 text-sm"><span>Show city</span><input type="checkbox" name="show_city" defaultChecked={p?.show_city} className="h-4 w-4 accent-[#087456]" /></label>
                  <label className="flex items-center justify-between gap-6 py-4 text-sm"><span>Show response rate</span><input type="checkbox" name="show_response_rate" defaultChecked={p?.show_response_rate} className="h-4 w-4 accent-[#087456]" /></label>
                  <label className="flex flex-wrap items-center justify-between gap-4 py-4 text-sm"><span>Introduction scope</span><select name="introduction_scope" defaultValue={p?.introduction_scope} className="field w-auto"><option value="everyone">Everyone</option><option value="matching_preferences">Matching preferences</option><option value="verified_only">Verified only</option><option value="nobody">Nobody</option></select></label>
                </div>
              </section>
              <div className="flex flex-wrap items-center gap-4 pt-5"><button className="btn-primary">Save privacy and display settings</button><span className="text-xs text-black/45">Changes apply to your profile and new introductions.</span></div>
            </form>

            <section id="communication" className="scroll-mt-8 rounded-2xl border border-black/10 bg-white/35 p-5 shadow-[0_8px_24px_rgba(15,23,42,.03)] sm:p-7" aria-labelledby="communication-heading">
              <p className="text-xs font-bold uppercase tracking-[.16em] text-[#087456]">Communication</p><h2 id="communication-heading" className="mt-2 font-serif text-3xl text-[#10231d]">Choose how you connect</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-black/60">Choose how new connections can reach you. Existing conversations and letters stay available.</p>
              <form action={saveCommunicationPreferences} className="mt-6 divide-y divide-black/10 border-y border-black/10">
                <label className="flex items-center justify-between gap-6 py-5 text-sm"><span><span className="font-medium">Instant Messaging</span><span className="mt-1 block text-sm leading-6 text-black/55">Let accepted introductions become instant conversations.</span></span><input type="checkbox" name="allow_instant_messages" defaultChecked={p?.allow_instant_messages !== false} className="h-4 w-4 accent-[#087456]" /></label>
                <label className="flex items-center justify-between gap-6 py-5 text-sm"><span><span className="font-medium">Snail Mail</span><span className="mt-1 block text-sm leading-6 text-black/55">Allow digital letters in established conversations.</span></span><input type="checkbox" name="allow_snail_mail" defaultChecked={p?.allow_snail_mail !== false} className="h-4 w-4 accent-[#087456]" /></label>
                <div className="flex flex-wrap items-center justify-between gap-4 py-5"><p className="max-w-md text-xs leading-5 text-black/50">Keep at least one mode enabled. This affects new communication only.</p><button className="btn-primary px-4 py-2.5 text-sm">Save communication preferences</button></div>
              </form>
            </section>

            <section id="login-methods" className="scroll-mt-8 rounded-2xl border border-black/10 bg-white/35 p-5 shadow-[0_8px_24px_rgba(15,23,42,.03)] sm:p-7" aria-labelledby="login-methods-heading">
              <p className="text-xs font-bold uppercase tracking-[.2em] text-[#087456]">Login methods</p><h2 id="login-methods-heading" className="mt-2 font-serif text-3xl text-[#10231d]">Sign in securely</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-black/60">Connect Google to sign in to this account. It won&apos;t verify your profile or change what people see.</p>
              <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-y border-black/10 py-5">
                <div><p className="text-sm font-medium text-[#263b33]">Google</p><p className="mt-1 text-sm text-black/55">{identityError ? "Login methods are temporarily unavailable." : googleLoginConnected ? "Connected" : "Not connected"}</p></div>
                {!identityError && (googleLoginConnected ? <form action={disconnectGoogleLogin}><button className="rounded-md border border-black/15 px-3 py-2 text-sm text-black/65 transition hover:border-black/30">Disconnect Google</button></form> : <form action={startGoogleLink}><button className="rounded-md border border-[#087456] px-3 py-2 text-sm font-medium text-[#075d46] transition hover:bg-[#e7eee8]">Connect Google</button></form>)}
              </div>
              {googleLoginConnected && identityData.identities.length < 2 && <p className="mt-3 text-xs leading-5 text-black/50">Add another login method before disconnecting Google to keep access.</p>}
            </section>

            <section id="security" className="scroll-mt-8 rounded-2xl border border-black/10 bg-white/35 p-5 shadow-[0_8px_24px_rgba(15,23,42,.03)] sm:p-7" aria-labelledby="security-heading">
              <p className="text-xs font-bold uppercase tracking-[.2em] text-[#087456]">Security</p><h2 id="security-heading" className="mt-2 font-serif text-3xl text-[#10231d]">Protect your account</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-black/60">Change your password or sign out other sessions. Google remains a separate login method.</p>
              <form action={changePassword} className="mt-6 max-w-xl space-y-4 border-y border-black/10 py-5">
                <label className="field-label">Current password<input name="current_password" type="password" autoComplete="current-password" required className="field mt-2 block w-full" /></label>
                <label className="field-label">New password<input name="password" type="password" autoComplete="new-password" minLength={8} required className="field mt-2 block w-full" /></label>
                <label className="field-label">Confirm new password<input name="password_confirmation" type="password" autoComplete="new-password" minLength={8} required className="field mt-2 block w-full" /></label>
                <button className="btn-secondary px-4 py-2.5 text-sm">Change password</button>
              </form>
              <form action={signOutOtherSessions} className="mt-5"><button className="rounded-md border border-black/15 px-4 py-2.5 text-sm font-medium text-[#075d46] hover:border-[#075d46]">Sign out other sessions</button><p className="mt-2 text-xs leading-5 text-black/50">This keeps this browser signed in and signs out other sessions.</p></form>
            </section>

            <section id="verification" className="scroll-mt-8 rounded-2xl border border-black/10 bg-white/35 p-5 shadow-[0_8px_24px_rgba(15,23,42,.03)] sm:p-7" aria-labelledby="verification-heading">
              <p className="text-xs font-bold uppercase tracking-[.2em] text-[#087456]">Trust, privately</p><h2 id="verification-heading" className="mt-2 font-serif text-3xl text-[#10231d]">Verify your profile</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-black/60">Verify privately with an authenticator app or another available account. Members only see whether you&apos;re verified, not which service you use.</p>
              <TotpVerificationPanel status={totpStatus} />
              <div className="mt-6 border-y border-black/10 py-5">
                <p className="text-sm font-medium text-[#263b33]">External account: {verificationState === "verified" ? "Verified" : verificationState === "needs-refresh" ? "Verification needs refresh" : verificationState === "ineligible" ? "Verification ineligible" : "Not verified"}</p>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-black/55">Verify control of an established external account. Members won&apos;t see which service you use.</p>
                {verificationState === "needs-refresh" && <p className="mt-1 text-sm leading-6 text-black/55">Reconnect your account to refresh this verification.</p>}
                {verificationState === "ineligible" && <p className="mt-1 text-sm leading-6 text-black/55">The connected account did not meet the current verification requirements.</p>}
                {verificationState === "not-verified" && <p className="mt-1 text-sm leading-6 text-black/55">Choose an available service to verify privately.</p>}
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {(verificationState === "not-verified" || verificationState === "ineligible") && enabledProviders.map((provider) => <Link key={provider} href={`/auth/verification/${encodeURIComponent(provider)}/start`} className="rounded-md border border-black/15 px-3 py-2 text-sm font-medium text-[#075d46] transition hover:border-[#075d46]">Verify with {providerLabel(provider)}</Link>)}
                  {verificationState === "needs-refresh" && activeProvider && enabledProviders.includes(activeProvider) && <Link href={`/auth/verification/${encodeURIComponent(activeProvider)}/start`} className="rounded-md border border-[#087456] bg-[#087456] px-3 py-2 text-sm font-medium text-white transition hover:bg-[#075d46]">Verify again</Link>}
                  {activeProvider && <form action={disconnectVerification}><input type="hidden" name="provider" value={activeProvider} /><button className="rounded-md border border-black/15 px-3 py-2 text-sm text-black/65 transition hover:border-black/30">Disconnect verification</button></form>}
                  {enabledProviders.length === 0 && verificationState !== "verified" && <p className="text-sm text-black/45">Verification services are not available yet.</p>}
                </div>
              </div>
            </section>

            <section id="your-data" className="scroll-mt-8 rounded-2xl border border-black/10 bg-white/35 p-5 shadow-[0_8px_24px_rgba(15,23,42,.03)] sm:p-7" aria-labelledby="data-heading">
              <p className="text-xs font-bold uppercase tracking-[.16em] text-[#087456]">Your data</p><h2 id="data-heading" className="mt-2 font-serif text-3xl text-[#10231d]">Access or remove your data</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-black/60">Download a machine-readable copy of your account data. You can generate one export every 48 hours.</p>
              <a href="/app/settings/data-export" className="mt-5 inline-flex rounded-md border border-black/15 px-4 py-2.5 text-sm font-medium text-[#075d46] hover:border-[#075d46]">Download my data</a>
              <details className="mt-8 border-t border-black/10 pt-5">
                <summary className="cursor-pointer text-sm font-medium text-red-700">Permanently delete account</summary>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-black/60">Deletion is permanent and removes your profile, photos, introductions, notifications, and shared conversations. Deactivation is reversible and keeps your data.</p>
                <form action={deleteAccount} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"><label className="flex-1 text-sm">Type <span className="font-semibold">DELETE</span> to confirm permanent deletion<input name="confirmation" required autoComplete="off" className="field mt-2 w-full" /></label><button className="rounded-md border border-red-300 px-4 py-2.5 text-sm text-red-700">Permanently delete account</button></form>
              </details>
            </section>

            <section id="account" className="scroll-mt-8 rounded-2xl border border-red-200/70 bg-red-50/20 p-5 sm:p-7" aria-labelledby="account-heading"><p className="text-xs font-bold uppercase tracking-[.16em] text-red-700/75">Account</p><h2 id="account-heading" className="mt-2 font-serif text-3xl text-[#10231d]">Account access</h2><p className="mt-3 text-sm leading-6 text-black/60">Deactivation pauses account access and keeps your data. An administrator can reactivate the account. This is separate from Pause participation.</p><div className="mt-5"><AccountActions deactivated={Boolean(p?.deactivated_at)} isAdmin={p.role === "admin"} /></div></section>
          </div>
        </div>
      </div>
    </main>
  );
}
