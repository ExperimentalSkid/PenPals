import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { saveProfile, uploadAvatar, removeAvatar } from "@/app/app/profile/actions";
import ProfileChoices from "@/app/app/profile/ProfileChoices";
import ProfileSignals from "@/app/app/profile/ProfileSignals";
import LocationEditor from "./LocationEditor";
import FriendshipDestinationPicker from "./FriendshipDestinationPicker";
import { isPrivateAvatarPath } from "@/lib/avatar";
import { hasCompletedProfile, onboardingNextStep, profileCompletionProgress } from "@/lib/profile-completeness";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import ProfileSaveButton from "./ProfileSaveButton";
import { getPageI18n } from "@/i18n/server";
import LanguageSwitcher from "@/app/components/LanguageSwitcher";

type SetupStepProps = { number: string; title: string; href: string; description: string; completeLabel: string; complete?: boolean; current?: boolean };

const LOCATION_REGION_PAGE_SIZE = 1000;

async function fetchAllLocationRegions(db: Awaited<ReturnType<typeof createClient>>) {
  const allRegions: Array<{ country_code: string; region_code: string; name: string; is_major: boolean }> = [];

  for (let offset = 0; ; offset += LOCATION_REGION_PAGE_SIZE) {
    const { data, error } = await db
      .from("location_regions")
      .select("country_code,region_code,name,is_major")
      .order("country_code")
      .order("region_code")
      .range(offset, offset + LOCATION_REGION_PAGE_SIZE - 1);

    if (error || !data) return allRegions;
    allRegions.push(...data);
    if (data.length < LOCATION_REGION_PAGE_SIZE) return allRegions;
  }
}

function SetupStep({ number, title, href, description, completeLabel, complete, current }: SetupStepProps) {
  return (
    <li>
      <Link href={href} aria-current={current ? "step" : undefined} className={`group flex items-start gap-3 rounded-lg px-2 py-2 transition hover:bg-white/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#087456] ${current ? "bg-white/60" : ""}`}>
        <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${complete ? "border-[#087456] bg-[#087456] text-white" : "border-black/20 bg-[#fffdfa] text-black/50"}`} aria-hidden="true">{complete ? "✓" : number}</span>
        <span className="min-w-0"><span className={`block text-sm font-semibold ${complete ? "text-brand" : "text-primary"}`}>{title}</span><span className="mt-0.5 block text-xs leading-5 text-black/45">{complete ? completeLabel : description}</span></span>
      </Link>
    </li>
  );
}

function SectionLabel({ number, children }: { number: string; children: React.ReactNode }) {
  return <p className="text-[10px] font-bold uppercase tracking-[.2em] text-brand">{number && <span className="mr-2 text-black/35">{number}</span>}{children}</p>;
}

export default async function ProfileSetup({ searchParams }: { searchParams: Promise<{ error?: string; appeal?: string }> }) {
  const { locale, t } = await getPageI18n();
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  const uid = data?.claims?.sub;
  if (!uid) redirect("/sign-in");

  const profile = (await db.from("profiles").select("username,display_name,birth_date,gender,country,city,country_code,region_code,locality_id,location_precision,bio,quote,avatar_path,social_style,daily_rhythm,environment_preference,travel_style,pets,connection_goals,conversation_style,reply_pace").eq("id", uid).maybeSingle()).data;
  const cookieStore = await cookies();
  const pendingAvatarPath = cookieStore.get("penpals_pending_avatar")?.value ?? null;
  const activeAvatarPath = profile?.avatar_path && isPrivateAvatarPath(profile.avatar_path, uid)
    ? profile.avatar_path
    : isPrivateAvatarPath(pendingAvatarPath, uid)
      ? pendingAvatarPath
      : null;
  let profilePhoto: string | null = null;
  if (activeAvatarPath) profilePhoto = (await db.storage.from("avatars").createSignedUrl(activeAvatarPath, 3600)).data?.signedUrl ?? null;

  const languages = (await db.from("languages").select("id,name").order("name")).data ?? [];
  const interests = (await db.from("interests").select("id,name").order("name")).data ?? [];
  const selectedLanguages = (await db.from("profile_languages").select("language_id,proficiency,purpose").eq("profile_id", uid)).data ?? [];
  const selectedInterests = (await db.from("profile_interests").select("interest_id").eq("profile_id", uid)).data ?? [];
  const [regions, { data: localities }, { data: destinations }, { data: configuredDestinationLimit }] = await Promise.all([
    fetchAllLocationRegions(db),
    db.from("location_localities").select("id,country_code,region_code,name,is_major").order("name"),
    db.from("profile_friendship_destinations").select("country_code,region_code").eq("profile_id", uid),
    db.rpc("get_friendship_destination_limit"),
  ]);
  const destinationLimit = typeof configuredDestinationLimit === "number" && Number.isInteger(configuredDestinationLimit) && configuredDestinationLimit > 0 ? configuredDestinationLimit : 5;
  const { error, appeal, saved } = await searchParams as { error?: string; appeal?: string; saved?: string };

  const progress = profileCompletionProgress(profile ?? {}, selectedLanguages.length, selectedInterests.length);
  const { basicsComplete, languagesComplete, interestsComplete, preferencesComplete, percent: completeness } = progress;
  const entryComplete = hasCompletedProfile(profile ?? {}, selectedLanguages.length, selectedInterests.length);
  const nextStep = onboardingNextStep(profile ?? {}, selectedLanguages.length, selectedInterests.length);
  const entryStepCount = [basicsComplete, languagesComplete, interestsComplete].filter(Boolean).length;
  const entryProgress = Math.round((entryStepCount / 3) * 100);
  const nextStepLabel = nextStep === "basics" ? t("app.profile.basics") : nextStep === "languages" ? t("app.profile.languagesStep") : nextStep === "interests" ? t("app.profile.interestsStep") : null;
  const setupNavSteps = [
    { href: "#basics", number: "1", label: t("app.profile.basics"), key: "basics" },
    { href: "#languages", number: "2", label: t("app.profile.languagesStep"), key: "languages" },
    { href: "#interests", number: "3", label: t("app.profile.interestsStep"), key: "interests" },
    { href: "#preferences", number: "4", label: t("app.profile.preferencesStep"), key: "preferences" },
  ];
  const fieldClass = "field mt-2 w-full rounded-lg bg-[#fffdfa]";
  const labelClass = "text-sm font-medium text-primary";

  return (
    <main className={`min-h-screen w-full bg-[#f7f5ef] px-4 py-5 text-primary sm:px-6 lg:px-10 ${entryComplete ? "lg:py-10" : "lg:py-12"}`}>
      <div className={`mx-auto grid w-full ${entryComplete ? "max-w-[1320px] gap-8 lg:grid-cols-[232px_minmax(0,1fr)] lg:gap-10" : "max-w-[1120px] gap-6 lg:grid-cols-[208px_minmax(0,1fr)] lg:gap-8"}`}>
        <aside className="self-start lg:sticky lg:top-8">
          <div className="mb-4 flex justify-center"><LanguageSwitcher locale={locale} label={t("common.language")} /></div>
          <section aria-labelledby="preview-heading" className="rounded-2xl border border-[#deded5] bg-[#fffdfa] p-4 shadow-[0_8px_25px_rgba(24,45,35,.04)]">
            <h2 id="preview-heading" className="font-serif text-lg text-primary">{t("app.profile.preview")} <span className="font-sans text-xs font-normal text-black/45">{t("app.profile.optional")}</span></h2>
            <div className="mt-4 flex justify-center">
              <div className={`relative flex items-center justify-center overflow-hidden rounded-[18px] border border-dashed border-black/20 bg-[#efeee6] ${entryComplete ? "h-[220px] w-[152px]" : "h-[176px] w-[122px]"}`}>
                {profilePhoto ? <Image src={profilePhoto} alt="Your profile" fill unoptimized sizes="152px" className="object-cover" /> : <span className="font-serif text-5xl text-muted" aria-hidden="true">{profile?.display_name?.trim().charAt(0).toUpperCase() || "·"}</span>}
              </div>
            </div>
            <form action={uploadAvatar} className="mt-4 space-y-2">
              <label htmlFor="avatar-upload" className="block text-xs leading-5 text-black/55">{t("app.profile.formats")}<br />{t("app.profile.max5")}</label>
              <input id="avatar-upload" type="file" name="avatar" accept="image/jpeg,image/png,image/webp" required className="block w-full text-[11px] text-black/60 file:mr-1 file:rounded-md file:border-0 file:bg-[#e7e9df] file:px-2 file:py-1.5 file:text-[11px] file:font-medium file:text-primary" />
              <button className={`${entryComplete ? "btn-primary" : "btn-secondary"} w-full rounded-lg px-3 py-2 text-xs`}>{profile?.avatar_path ? t("app.profile.replacePhoto") : t("app.profile.uploadPhoto")}</button>
            </form>
            {profile?.avatar_path && <form action={removeAvatar} className="mt-2"><button className="text-xs text-black/50 underline hover:text-red-700">{t("app.profile.removePhoto")}</button></form>}
          </section>

          <section aria-labelledby="progress-heading" className={`mt-6 ${entryComplete ? "border-t border-black/10 pt-6" : "rounded-2xl border border-[#deded5] bg-white/55 p-4"}`}>
            <h2 id="progress-heading" className="font-serif text-lg text-primary">{t("app.profile.progress")}</h2>
            <ol className="mt-4 space-y-1">
              <SetupStep number="1" title={t("app.profile.basics")} href="#basics" description={t("app.profile.basicsDesc")} completeLabel={t("app.profile.complete")} complete={basicsComplete} current={nextStep === "basics"} />
              <SetupStep number="2" title={t("app.profile.languagesStep")} href="#languages" description={t("app.profile.languagesStepDesc")} completeLabel={t("app.profile.complete")} complete={languagesComplete} current={nextStep === "languages"} />
              <SetupStep number="3" title={t("app.profile.interestsStep")} href="#interests" description={t("app.profile.interestsStepDesc")} completeLabel={t("app.profile.complete")} complete={interestsComplete} current={nextStep === "interests"} />
              <SetupStep number="4" title={t("app.profile.preferencesStep")} href="#preferences" description={t("app.profile.optionalDetailsStep")} completeLabel={t("app.profile.complete")} complete={preferencesComplete} />
            </ol>
          </section>

          <div className="mt-8 border-t border-black/10 pt-5 text-xs leading-5 text-black/50"><span className="mr-2 text-brand">✧</span>{t("app.profile.safety")}<br /><span className="pl-5">{t("app.profile.safetyBody")}</span></div>
        </aside>

        <section className="min-w-0">
          <div className={`mb-5 flex flex-wrap items-center justify-between gap-3 ${entryComplete ? "" : "rounded-lg border border-[#d9d3c8] bg-white/45 px-4 py-3"}`}>
            {entryComplete ? <Link href="/app" className="inline-flex items-center gap-2 text-sm font-medium text-brand transition hover:text-brand hover:underline"><span aria-hidden="true">←</span> {t("app.profile.backApp")}</Link> : <p className="text-sm font-medium text-primary"><span className="text-[10px] font-bold uppercase tracking-[.16em] text-[#073A73]">{t("app.profile.setup")}</span>{" "}<span className="text-black/50">·</span>{" "}<span>{t("app.profile.required")}</span></p>}
            {entryComplete && profile?.username && <Link href={`/app/profile/${encodeURIComponent(profile.username)}?from=setup`} className="text-sm font-medium text-brand underline underline-offset-4 hover:text-brand">{t("app.profile.viewPublic")}</Link>}
          </div>

          <header className="mb-6">
            <SectionLabel number="01">{t("app.profile.yourProfile")}</SectionLabel>
            <h1 className="page-title-display mt-2">{entryComplete ? t("app.profile.editProfile") : t("app.profile.setUpProfile")}</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-black/60">{t("app.profile.intro")}</p>
            <div className="mt-5 rounded-lg border border-[#d9d3c8] bg-[#f1ebdf]/55 px-4 py-3 text-sm leading-6 text-muted">
              <p className="font-semibold text-[#102A43]">{entryComplete ? t("app.profile.readyExplore") : t("app.profile.basicsNeeded")}</p>
              <p className="mt-1">{entryComplete ? t("app.profile.updateAnytime") : t("app.profile.requiredHelp")}</p>
            </div>
            {!entryComplete && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#d9d3c8] bg-white/65 px-4 py-3" aria-label={`Entry progress: ${entryStepCount} of 3 required sections complete`}>
              <div><p className="text-sm font-semibold text-[#102A43]">{t("app.profile.entryProgress")}</p><p className="mt-0.5 text-xs text-muted">{nextStepLabel ? t("app.profile.next", { step: nextStepLabel }) : t("app.profile.basicsReady")}</p></div>
              <div className="flex min-w-[180px] flex-1 items-center gap-3 sm:max-w-[310px]"><div role="progressbar" aria-valuemin={0} aria-valuemax={3} aria-valuenow={entryStepCount} aria-valuetext={`${entryStepCount} of 3 required sections complete`} className="h-2 flex-1 overflow-hidden rounded-full bg-[#d9d3c8]"><div className="h-full rounded-full bg-[#073A73] transition-[width] duration-300" style={{ width: `${entryProgress}%` }} /></div><span className="shrink-0 text-xs font-semibold text-[#102A43]">{entryStepCount}/3</span></div>
            </div>}
            {saved === "1" && !entryComplete && <p className="mt-4 border-l-2 border-[#087456] bg-[#eef6f1] px-3 py-2 text-sm text-brand" role="status">{t("app.profile.savedContinue", { step: nextStep === "basics" ? t("app.profile.yourBasics") : nextStep === "languages" ? t("app.profile.yourLanguages") : t("app.profile.yourInterests") })}</p>}
            {error && <p className="mt-5 border-l-2 border-red-400 bg-red-50/40 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
            {appeal === "1" && <p className="mt-3 text-sm text-black/60">{t("app.profile.birthWrong")} <Link href="/age-appeal" className="font-semibold text-brand underline">{t("app.profile.requestCorrection")}</Link></p>}
          </header>

          <div className="overflow-hidden rounded-2xl border border-[#deded5] bg-[#fffdfa] shadow-[0_12px_35px_rgba(24,45,35,.05)]">
            <nav aria-label={t("app.profile.profileSections")} className="grid grid-cols-2 border-b border-black/10 sm:grid-cols-4">
              {setupNavSteps.map((step) => { const current = !entryComplete && nextStep === step.key; return <Link key={step.href} href={step.href} aria-current={current ? "step" : undefined} className={`flex items-center justify-center gap-2 border-b-2 px-3 py-4 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#087456] ${current ? "border-[#073A73] bg-[#e7f1fa] text-[#073A73]" : "border-transparent text-black/55 hover:border-[#087456]/40 hover:bg-[#f5f5ee] hover:text-brand"}`}><span className={`flex h-6 w-6 items-center justify-center rounded-full border text-xs ${current ? "border-[#073A73] bg-[#073A73] text-white" : "border-black/15"}`}>{step.number}</span>{step.label}{step.key === "preferences" && <span className="hidden text-[10px] font-normal text-black/45 sm:inline">{t("app.profile.optional")}</span>}</Link>; })}
            </nav>

            <form action={saveProfile} className="space-y-0">
              <section id="basics" aria-labelledby="basics-heading" className="scroll-mt-8 p-5 sm:p-8 lg:p-10">
                <SectionLabel number="01">{t("app.profile.aboutYou")}</SectionLabel>
                <h2 id="basics-heading" className="section-title mt-2">{t("app.profile.aboutYou")}</h2>
                <div className="mt-6 grid gap-x-5 gap-y-5 sm:grid-cols-2">
                  <label className={labelClass}>{t("app.profile.displayName")} <span className="text-xs font-normal text-black/45">{t("app.profile.requiredLabel")}</span><input name="display_name" required defaultValue={profile?.display_name ?? ""} placeholder={t("app.profile.namePlaceholder")} className={fieldClass} /></label>
                  <label className={labelClass}>{t("app.profile.birthDate")} <span className="text-xs font-normal text-black/45">{t("app.profile.requiredLabel")}</span><input name="birth_date" type="date" required defaultValue={profile?.birth_date ?? ""} className={fieldClass} /></label>
                  <label className={labelClass}>{t("app.profile.gender")} <span className="text-xs font-normal text-black/45">{t("app.profile.optional")}</span><input name="gender" defaultValue={profile?.gender === "prefer_not_to_say" ? "" : profile?.gender ?? ""} placeholder={t("app.profile.genderPlaceholder")} className={fieldClass} /></label>
                  <div className="sm:col-span-2"><LocationEditor initialCountryCode={profile?.country_code} initialRegionCode={profile?.region_code} initialLocalityId={profile?.locality_id} initialPrecision={profile?.location_precision} initialCountry={profile?.country} initialCity={profile?.city} regions={(regions ?? []).map((region) => ({ code: region.region_code, country_code: region.country_code, name: region.name, is_major: region.is_major }))} localities={(localities ?? []).map((locality) => ({ id: locality.id, country_code: locality.country_code, region_code: locality.region_code, name: locality.name, is_major: locality.is_major }))} /></div>
                </div>
              </section>

              <section aria-labelledby="about-heading" className="border-t border-black/10 p-5 sm:p-8 lg:p-10">
                <SectionLabel number="">{t("app.profile.yourStory")}</SectionLabel>
                <h2 id="about-heading" className="section-title mt-2">{t("app.profile.aboutMe")}</h2>
                <label className={`${labelClass} mt-5 block`}>{t("app.profile.shortIntro")} <span className="text-xs font-normal text-black/45">{t("app.profile.optional")}</span><textarea name="bio" maxLength={500} rows={6} defaultValue={profile?.bio ?? ""} placeholder={t("app.profile.bioPlaceholder")} className={`${fieldClass} leading-7`} /></label>
                <label className={`${labelClass} mt-6 block`}>{t("app.profile.lineYou")} <span className="text-xs font-normal text-black/45">{t("app.profile.optional")}</span><textarea name="quote" maxLength={240} rows={3} defaultValue={profile?.quote ?? ""} placeholder={t("app.profile.quotePlaceholder")} className={`${fieldClass} font-serif text-lg leading-7`} /></label>
              </section>

              <section id="languages" aria-labelledby="languages-heading" className="scroll-mt-8 border-t border-black/10 p-5 sm:p-8 lg:p-10">
                <SectionLabel number="02">{t("app.profile.languages")}</SectionLabel>
                <h2 id="languages-heading" className="section-title mt-2">{t("app.profile.languagesUse")}</h2>
                <p className="section-description mt-2 max-w-xl">{t("app.profile.languagesHelp")}</p>
                <div className="mt-6"><ProfileChoices languages={languages} interests={interests} initialLanguages={selectedLanguages} initialInterests={[]} section="languages" /></div>
              </section>

              <section id="interests" aria-labelledby="interests-heading" className="scroll-mt-8 border-t border-black/10 p-5 sm:p-8 lg:p-10">
                <SectionLabel number="03">{t("app.profile.interests")}</SectionLabel>
                <h2 id="interests-heading" className="section-title mt-2">{t("app.profile.interests")}</h2>
                <p className="section-description mt-2 max-w-xl">{t("app.profile.interestsHelp")}</p>
                <div className="mt-5"><ProfileChoices languages={[]} interests={interests} initialLanguages={[]} initialInterests={selectedInterests.map((item) => item.interest_id)} section="interests" /></div>
              </section>

              <section id="preferences" aria-labelledby="preferences-heading" className="scroll-mt-8 border-t border-black/10 p-5 sm:p-8 lg:p-10">
                <SectionLabel number="04">{t("app.profile.preferences")}</SectionLabel>
                <h2 id="preferences-heading" className="section-title mt-2">{t("app.profile.connectionPreferences")}</h2>
                <div className="mt-6 space-y-8">
                  <section aria-labelledby="destinations-heading">
                    <h3 id="destinations-heading" className="subsection-title">{t("app.profile.places")} <span className="font-sans text-xs font-normal text-black/45">{t("app.profile.optional")}</span></h3>
                    <p className="section-description mt-2">{t("app.profile.destinationHelp", { limit: destinationLimit })}</p>
                    <div className="mt-4"><FriendshipDestinationPicker initialDestinations={(destinations ?? []).map((destination) => ({ country_code: destination.country_code, region_code: destination.region_code }))} regions={(regions ?? []).map((region) => ({ code: region.region_code, country_code: region.country_code, name: region.name, is_major: region.is_major }))} maxDestinations={destinationLimit} /></div>
                  </section>
                  <section aria-labelledby="signals-heading" className="border-t border-black/10 pt-7">
                    <h3 id="signals-heading" className="subsection-title">{t("app.profile.optionalDetails")}</h3>
                    <p className="section-description mt-2">{t("app.profile.optionalDetailsBody")}</p>
                    <div className="mt-5"><ProfileSignals initial={{ social_style: profile?.social_style, daily_rhythm: profile?.daily_rhythm, environment_preference: profile?.environment_preference, travel_style: profile?.travel_style, pets: profile?.pets, connection_goals: Array.isArray(profile?.connection_goals) ? profile.connection_goals : [], conversation_style: profile?.conversation_style, reply_pace: profile?.reply_pace }} /></div>
                  </section>
                </div>
              </section>

              <div className="flex flex-wrap items-center justify-between gap-4 border-t border-black/10 bg-[#f8f8f2] px-5 py-5 sm:px-8 lg:px-10"><p className="text-sm text-black/50">{entryComplete ? <><span className="font-medium text-[#102A43]">{completeness}% complete</span> · {t("app.profile.updateAnytime")}</> : <><span className="font-medium text-[#102A43]">{entryStepCount} of 3 entry steps complete</span> · {t("app.profile.saveContinue")}</>}</p><ProfileSaveButton isEdit={Boolean(profile)} isOnboarding={!entryComplete} /></div>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
