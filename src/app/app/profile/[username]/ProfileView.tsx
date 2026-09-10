import Image from "next/image";
import Link from "next/link";
import { startConversation } from "@/app/app/messages/actions";
import BlockControl from "@/app/app/profile/BlockControl";
import IcebreakerModal from "@/app/profile/IcebreakerModal";
import { PresenceStatus } from "@/app/PresenceProvider";
import { isSignedAvatarUrl } from "@/lib/avatar";
import AboutSection from "./AboutSection";
import LanguagesSection, { type ProfileLanguage } from "./LanguagesSection";
import InterestsSection, { type ProfileInterest } from "./InterestsSection";
import PersonalityLifestyleSection, { type ProfilePersonality } from "./PersonalityLifestyleSection";
import FriendshipDestinationsSection, { type ProfileFriendshipDestination } from "./FriendshipDestinationsSection";
import ProfileBadge from "@/app/components/ProfileBadge";
import type { ProfileBadgeKey } from "@/lib/profile-badges";
import type { LanguageCompatibility } from "@/lib/language-compatibility";
import type { ReactNode } from "react";
import { getPageI18n } from "@/i18n/server";

type Profile = {
  show_activity_status?: boolean | null;
  availability?: string | null;
  quote?: string | null;
  bio?: string | null;
  is_verified?: boolean | null;
  role?: "user" | "moderator" | "admin" | string | null;
  activity_rank?: string | null;
  activity_rank_flavor?: string | null;
};
type ProfileViewProps = {
  profile: Profile;
  displayName: string;
  age: number | null;
  location: string;
  activity: string | null;
  responseRate: string | null;
  photo: string | null;
  languages: ProfileLanguage[];
  interests: ProfileInterest[];
  friendshipDestinations?: ProfileFriendshipDestination[];
  personality?: ProfilePersonality | null;
  communicationPreference?: string | null;
  languageCompatibility?: LanguageCompatibility | null;
  badges: ProfileBadgeKey[];
  blocked: boolean;
  targetId: string;
  username: string;
  reportControl: ReactNode;
  isOwn: boolean;
  backHref?: string;
  backLabel?: string;
  reportError?: string | null;
  reportSubmitted?: boolean;
};

type DetailIconName = "languages" | "interests" | "response" | "communication" | "location" | "eye";

function DetailIcon({ name }: { name: DetailIconName }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0" {...common}>
      {name === "languages" && <><circle cx="12" cy="12" r="8.5" /><path d="M3.8 12h16.4M12 3.5c2.2 2.4 3.3 5.2 3.3 8.5S14.2 18.1 12 20.5c-2.2-2.4-3.3-5.9-3.3-8.5S9.8 5.9 12 3.5Z" /></>}
      {name === "interests" && <><path d="m12 3 2.2 6.2L20 12l-5.8 2.8L12 21l-2.2-6.2L4 12l5.8-2.8L12 3Z" /><path d="m19 3 .5 1.5L21 5l-1.5.5L19 7l-.5-1.5L17 5l1.5-.5L19 3Z" /></>}
      {name === "response" && <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3.5 2" /></>}
      {name === "communication" && <><rect x="3.5" y="5" width="17" height="13" rx="2" /><path d="m4.5 7 7.5 5 7.5-5" /></>}
      {name === "location" && <><path d="M12 20s6-5.1 6-10a6 6 0 1 0-12 0c0 4.9 6 10 6 10Z" /><circle cx="12" cy="10" r="2" /></>}
      {name === "eye" && <><path d="M3 12s3.2-5 9-5 9 5 9 5-3.2 5-9 5-9-5-9-5Z" /><circle cx="12" cy="12" r="2" /></>}
    </svg>
  );
}

function DetailHeading({ icon, children }: { icon: DetailIconName; children: ReactNode }) {
  return <h2 className="flex items-center gap-3 font-sans text-[11px] font-semibold uppercase tracking-[.18em] text-primary"><DetailIcon name={icon} />{children}</h2>;
}

function interestName(value: ProfileInterest["interests"]) {
  const relation = Array.isArray(value) ? value[0] : value;
  return relation?.name?.trim() || null;
}

export default async function ProfileView({ profile, displayName, age, location, activity, responseRate, photo, languages, interests, friendshipDestinations = [], personality, communicationPreference, languageCompatibility, badges, blocked, targetId, username, reportControl, isOwn, backHref = "/app/discover", backLabel = "", reportError = null, reportSubmitted = false }: ProfileViewProps) {
  const { t } = await getPageI18n();
  const initial = displayName.trim().charAt(0).toUpperCase() || "·";
  const communicationModes = communicationPreference === "snail_mail"
    ? [t("app.profile.snailMail")]
    : communicationPreference === "instant"
      ? [t("app.profile.instantMessages")]
      : communicationPreference === "both"
        ? [t("app.profile.instantMessages"), t("app.profile.snailMail")]
        : [];
  const communicationPreferenceSummary = communicationPreference === "snail_mail"
    ? t("app.profile.prefersSnailMail")
    : communicationPreference === "instant"
      ? t("app.profile.prefersInstant")
      : communicationPreference === "both"
        ? t("app.profile.openToBoth")
        : null;
  const responseCopy = responseRate?.includes("%") ? t("app.profile.repliesToIntroductions", { rate: responseRate }) : responseRate;

  return (
    <main className="min-h-screen w-full bg-[#f7f5ef] px-5 py-6 text-primary sm:px-8 lg:px-10 lg:py-8">
      <div className="mx-auto w-full max-w-[1240px]">
        <Link href={backHref} className="inline-flex items-center gap-2 text-sm font-medium text-brand transition hover:text-brand hover:underline"><span aria-hidden="true">←</span> {backLabel}</Link>
        {reportError && <p role="alert" className="mt-4 border-l-2 border-red-400 px-3 py-2 text-sm text-red-700">{reportError}</p>}
        {reportSubmitted && <p role="status" className="notice notice-success mt-4">{t("app.profile.reported")}</p>}

        <section className="mt-9 grid grid-cols-1 gap-y-12 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-x-12 xl:grid-cols-[260px_minmax(0,1fr)_280px] xl:gap-x-10 2xl:grid-cols-[300px_minmax(0,1fr)_300px] 2xl:gap-x-12">
          <aside className="w-full max-w-[300px] justify-self-center lg:max-w-[280px] lg:justify-self-start xl:max-w-[260px] 2xl:max-w-[300px]">
            <div className="relative aspect-[0.68] w-full overflow-hidden rounded-[20px] border border-[#d9cdb9] bg-[#f1e8d9] p-2 shadow-[0_3px_0_#e4d8c6]">
              <div className="relative h-full w-full overflow-hidden rounded-[14px] bg-[#e9e8df]">
                {photo ? <Image src={photo} alt={displayName} fill priority sizes="(min-width: 1280px) 300px, 240px" unoptimized={isSignedAvatarUrl(photo)} className="object-cover" /> : <div role="img" aria-label={t("app.profile.photoUnavailableFor", { name: displayName })} className="flex h-full items-center justify-center"><span aria-hidden="true" className="font-serif text-6xl text-muted">{initial}</span></div>}
              </div>
              {photo && <div className="absolute bottom-4 left-1/2 inline-flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full bg-[#fbfaf7]/95 px-3 py-1.5 text-xs font-medium text-brand shadow-sm"><DetailIcon name="eye" />{t("app.profile.photoVisible")}</div>}
            </div>
            {profile.is_verified && <div className="mt-3 flex justify-center">
              <ProfileBadge
                badge="verified"
                className="group"
                trailing={<>
                  <button type="button" aria-label={t("app.profile.aboutVerification")} aria-describedby="profile-verification-tooltip" className="relative flex h-5 w-5 items-center justify-center rounded-full border border-[#087456]/35 text-[11px] font-semibold text-brand outline-none transition hover:bg-white/70 focus-visible:ring-2 focus-visible:ring-[#087456]/40">
                    <span aria-hidden="true">?</span>
                  </button>
                  <span id="profile-verification-tooltip" role="tooltip" className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-20 w-64 -translate-x-1/2 rounded-md border border-black/10 bg-[#fffdfa] px-3 py-2 text-left text-xs font-normal leading-5 text-primary opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">{t("app.profile.verifiedTooltip")}</span>
                </>}
              />
            </div>}
            <div className="mt-5 w-full [&>button]:min-h-11 [&>button]:w-full [&>button]:rounded-md">
              {isOwn ? <Link href="/app/profile/setup" className="btn-primary inline-flex min-h-11 w-full items-center justify-center rounded-md text-center">{t("app.profile.edit")}</Link> : <IcebreakerModal action={startConversation} userId={targetId} username={username} recipientName={displayName} interestNames={interests.flatMap((interest) => { const name = interestName(interest.interests); return name ? [name] : []; })} />}
            </div>
            {!isOwn && <div className="mt-3 w-full"><details className="relative"><summary className="flex cursor-pointer list-none items-center justify-between rounded-md border border-[#d7d0c3] bg-[#fbfaf6] px-4 py-3 text-sm font-medium text-primary transition hover:bg-white/75">{t("app.profile.more")} <span className="text-black/40" aria-hidden="true">⌄</span></summary><div className="absolute left-0 top-[calc(100%+6px)] z-20 w-full rounded-md border border-black/10 bg-[#fffdfa] p-2 shadow-lg"><div className="p-1"><BlockControl blocked={blocked} id={targetId} username={username} /></div><div className="border-t border-black/[0.06] p-1 pt-2">{reportControl}</div></div></details></div>}
          </aside>

          <div className="min-w-0 pt-1 lg:pt-8">
            <h1 className="font-serif text-[clamp(3.1rem,3.6vw,3.75rem)] leading-[.96] tracking-[-0.045em] text-primary">{displayName}{age !== null ? `, ${age}` : ""}</h1>
            {location && <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-black/10 bg-[#fbfaf7]/95 px-3 py-1.5 text-sm text-black/65 shadow-sm"><DetailIcon name="location" /><span>{location}</span></div>}
            <div className="mt-5 flex min-h-5 flex-wrap items-center gap-x-4 gap-y-2 text-sm text-black/60">
              <PresenceStatus userId={targetId} fallback={profile.availability === "away" ? t("app.profile.away") : t("app.profile.available")} visible={profile.show_activity_status !== false} blocked={blocked} availability={profile.availability} awayLabel={t("app.presence.away")} onlineLabel={t("app.presence.onlineNow")} />
              {profile.show_activity_status !== false && activity && <><span className="text-black/25" aria-hidden="true">•</span><span>{activity}</span></>}
              {(profile.role === "admin" || profile.role === "moderator") && <>
                <span className="text-black/25" aria-hidden="true">•</span>
                <span className="inline-flex items-center gap-1 font-medium text-black/60">
                  {profile.role === "admin" ? t("app.profile.admin") : t("app.profile.moderator")}
                  {profile.role === "admin" && ["admin", "mentalclay"].includes(username.toLowerCase()) && <span className="group relative inline-flex items-center">
                    <button type="button" aria-label={t("app.profile.aboutOwner")} aria-describedby="site-owner-tooltip" className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[13px] leading-none text-black/60 outline-none transition hover:text-brand focus-visible:ring-2 focus-visible:ring-[#087456]/40"><span aria-hidden="true">♛</span></button>
                    <span id="site-owner-tooltip" role="tooltip" className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-20 w-56 -translate-x-1/2 rounded-md border border-black/10 bg-[#fffdfa] px-3 py-2 text-left text-xs font-normal leading-5 text-primary opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">{t("app.profile.ownerTooltip")}</span>
                  </span>}
                </span>
              </>}
            </div>
            {profile.activity_rank && <div className="mt-5 text-sm text-black/50"><p className="font-semibold text-brand">{profile.activity_rank}</p>{profile.activity_rank_flavor && <p className="mt-1 italic">{profile.activity_rank_flavor}</p>}</div>}
            <div className="mt-6 max-w-[720px] border-t border-black/10" aria-hidden="true" />
            {badges.length > 0 && <section aria-labelledby="badges-heading" className="mt-7 max-w-[720px]">
              <h2 id="badges-heading" className="font-serif text-[30px] tracking-[-0.025em] text-primary">{t("app.profile.badges")}</h2>
              <div className="mt-3 flex max-w-full flex-wrap gap-1.5" aria-label={t("app.profile.profileBadges")}>
                {badges.map((badge) => <ProfileBadge key={badge} badge={badge} compact />)}
              </div>
            </section>}
            {profile.quote && <blockquote className="relative mt-8 max-w-[720px] pl-6 font-serif text-[clamp(2.1rem,2.8vw,2.5rem)] leading-[1.2] tracking-[-0.04em] text-brand"><span aria-hidden="true" className="absolute left-0 top-[-.15em] text-[2.7rem] text-muted">“</span>{profile.quote}<span aria-hidden="true">”</span></blockquote>}
          </div>

          <aside className="order-4 border-t border-black/10 pt-8 lg:col-span-2 xl:order-none xl:col-span-1 xl:row-span-2 xl:border-l xl:border-t-0 xl:pl-10 xl:pt-1 2xl:pl-12">
            <LanguagesSection languages={languages} />
            {languageCompatibility && (languageCompatibility.sharedLanguages.length > 0 || languageCompatibility.exchangeLanguages.length > 0) && <div className="mt-4 border-t border-black/[0.08] pt-4 text-sm leading-6 text-brand" aria-label={t("app.profile.languageCompatibility")}>
              {languageCompatibility.sharedLanguages.length > 0 && <p><span className="font-medium">{t("app.profile.bothSpeak")}</span> {languageCompatibility.sharedLanguages.join(", ")}</p>}
              {languageCompatibility.exchangeLanguages.length > 0 && <p className={languageCompatibility.sharedLanguages.length > 0 ? "mt-1 text-black/55" : "text-brand"}><span className="font-medium">{t("app.profile.languageExchange")}</span> {languageCompatibility.exchangeLanguages.join(", ")}</p>}
            </div>}
            <InterestsSection interests={interests} />
            <FriendshipDestinationsSection destinations={friendshipDestinations} />
            {responseCopy && <section aria-labelledby="response-heading" className="mt-9 border-t border-black/10 pt-7"><DetailHeading icon="response"><span id="response-heading">{t("app.profile.responseRate")}</span></DetailHeading><p className="mt-5 text-[15px] leading-6 text-black/70">{responseCopy}</p></section>}
            {communicationModes.length > 0 && <section aria-labelledby="communication-heading" aria-label={communicationPreferenceSummary ?? undefined} className="mt-9 border-t border-black/10 pt-7"><DetailHeading icon="communication"><span id="communication-heading">{t("app.profile.communicationPreferences")}</span></DetailHeading><div className="mt-4 space-y-3">{communicationModes.map((mode) => <p key={mode} className="flex items-center gap-3 text-[15px] text-black/70"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#e8ede5] text-brand"><DetailIcon name="communication" /></span>{mode}</p>)}</div></section>}
          </aside>

          <AboutSection bio={profile.bio} />
          <PersonalityLifestyleSection personality={personality} heading={t("app.profile.personality")} />
        </section>
      </div>
    </main>
  );
}
