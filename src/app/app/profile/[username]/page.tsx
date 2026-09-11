import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthorizedProfilePhoto } from "@/lib/private-avatar-server";
import { submitReport } from "@/app/app/reports/actions";
import { safeAdminReturnTo } from "@/app/app/admin/investigation-context";
import { deriveLanguageCompatibility, languageNameFromRelation, type LanguageCompatibilityEntry, type LanguageRelation } from "@/lib/language-compatibility";
import { PROFILE_BADGE_DEFINITIONS, type ProfileBadgeKey } from "@/lib/profile-badges";
import ProfileView from "./ProfileView";
import { getPageI18n } from "@/i18n/server";

export const dynamic = "force-dynamic";

type ProfileNavigation = { from?: string; conversation?: string; return_to?: string; error?: string; reported?: string };

function compatibilityEntries(rows: unknown): LanguageCompatibilityEntry[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const record = row as { language_id?: unknown; languages?: LanguageRelation | LanguageRelation[] | null; proficiency?: unknown; purpose?: unknown };
    const languageId = typeof record.language_id === "number" ? record.language_id : Number(record.language_id);
    const name = languageNameFromRelation(record.languages);
    if (!Number.isSafeInteger(languageId) || !name || name === "Language") return [];
    return [{
      language_id: languageId,
      name,
      proficiency: typeof record.proficiency === "string" ? record.proficiency : null,
      purpose: typeof record.purpose === "string" ? record.purpose : null,
    }];
  });
}

function badgeKeys(rows: unknown): ProfileBadgeKey[] {
  if (!Array.isArray(rows)) return [];
  const seen = new Set<ProfileBadgeKey>();
  const keys: ProfileBadgeKey[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const value = (row as { badge_key?: unknown }).badge_key;
    if (typeof value !== "string" || !(value in PROFILE_BADGE_DEFINITIONS)) continue;
    const key = value as ProfileBadgeKey;
    if (seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  return keys;
}

export default async function ProfilePage({ params, searchParams }: { params: Promise<{ username: string }>; searchParams?: Promise<ProfileNavigation> }) {
  const { t } = await getPageI18n();
  const db = await createClient();
  const { data: auth } = await db.auth.getClaims();
  if (!auth?.claims?.sub) redirect("/sign-in");
  const { username } = await params;
  const navigation = searchParams ? await searchParams : {};
  const adminReturnTo = safeAdminReturnTo(navigation.return_to);
  const { data: profile, error: profileError } = await db.rpc("get_public_profile", { target_username: username });
  if (profileError) throw profileError;
  if (!profile) notFound();

  const { data: identityData, error: identityError } = await db.rpc("resolve_profile_identity", { target_user: profile.id });
  if (identityError) throw identityError;
  const identity = Array.isArray(identityData) ? identityData[0] : identityData;
  if (!identity) notFound();
  const targetId = identity.id;
  const [languageResult, interestResult, blockResult, communicationModeResult, personalityResult, friendshipDestinationResult, viewerLanguageResult, staffRoleResult, badgeResult] = await Promise.all([
    targetId ? db.from("profile_languages").select("language_id, languages(name), proficiency, purpose").eq("profile_id", targetId) : Promise.resolve({ data: [] }),
    targetId ? db.from("profile_interests").select("interest_id, interests(name)").eq("profile_id", targetId) : Promise.resolve({ data: [] }),
    targetId ? db.from("profile_blocks").select("blocked_id").eq("blocker_id", auth.claims.sub).eq("blocked_id", targetId).maybeSingle() : Promise.resolve({ data: null }),
    targetId ? db.rpc("get_public_communication_mode", { target_user: targetId }) : Promise.resolve({ data: null }),
    targetId ? db.rpc("get_public_personality_lifestyle", { target_user: targetId }) : Promise.resolve({ data: null }),
    targetId ? db.rpc("get_public_friendship_destinations", { target_user: targetId }) : Promise.resolve({ data: [] }),
    auth.claims.sub ? db.from("profile_languages").select("language_id, languages(name), proficiency, purpose").eq("profile_id", auth.claims.sub) : Promise.resolve({ data: [] }),
    targetId ? db.rpc("get_public_staff_role", { target_user: targetId }) : Promise.resolve({ data: null }),
    targetId ? db.rpc("get_profile_badges", { target_user: targetId }) : Promise.resolve({ data: [] }),
  ]);
  const isOwn = auth.claims.sub === targetId;
  const languageCompatibility = isOwn
    ? null
    : deriveLanguageCompatibility(compatibilityEntries(viewerLanguageResult.data), compatibilityEntries(languageResult.data));
  const reportControl: ReactNode = isOwn ? null : <details><summary className="flex min-h-10 cursor-pointer list-none items-center rounded-md px-3 py-2 text-sm font-medium text-black/60 transition hover:bg-black/[0.035] hover:text-primary">{t("app.reports.profile")}</summary><form action={submitReport} className="user-soft-panel mt-2 space-y-3 p-3"><input type="hidden" name="target_type" value="profile" /><input type="hidden" name="target_id" value={targetId ?? ""} /><input type="hidden" name="return_to" value={`/app/profile/${encodeURIComponent(profile.username)}`} /><select name="reason" className="field w-full text-sm" aria-label={t("app.reports.reason")}><option value="spam">{t("app.reports.spam")}</option><option value="scam/fraud">{t("app.reports.scam")}</option><option value="harassment">{t("app.reports.harassment")}</option><option value="sexual/inappropriate content">{t("app.reports.sexual")}</option><option value="hate/abuse">{t("app.reports.hate")}</option><option value="fake profile/impersonation">{t("app.reports.fake")}</option><option value="underage concern">{t("app.reports.underage")}</option><option value="other">{t("app.reports.other")}</option></select><textarea name="details" aria-label={t("app.reports.details")} className="field min-h-24 w-full text-sm" placeholder={t("app.profile.reportDetailsPlaceholder")} /><button className="user-danger-button w-full">{t("app.reports.profile")}</button></form></details>;
  const displayName = profile.display_name?.replace(/\b\w/g, (character: string) => character.toUpperCase()) ?? profile.username;
  const age = typeof profile.age === "number" ? profile.age : (typeof identity.age === "number" ? identity.age : null);
  const authorizedPhoto = targetId ? await getAuthorizedProfilePhoto(db, targetId, auth.claims.sub) : { allowed: false, url: null, error: false };
  const photo = authorizedPhoto.url;
  const activity = profile.activity_status ?? null;
  const viewProfile = {
    ...profile,
    role: staffRoleResult.data === "admin" || staffRoleResult.data === "moderator" ? staffRoleResult.data : null,
    show_activity_status: activity !== null,
    availability: activity === "Away" ? "away" : "available",
  };
  const existingMemberships = isOwn ? { data: [], error: null } : await db.from("conversation_participants").select("conversation_id").eq("user_id", auth.claims.sub);
  const existingConversationIds = (existingMemberships.data ?? []).map((row) => row.conversation_id);
  const existingConversationResult = !isOwn && existingConversationIds.length
    ? await db.from("conversation_participants").select("conversation_id").eq("user_id", targetId).in("conversation_id", existingConversationIds).limit(1).maybeSingle()
    : { data: null, error: null };
  const existingConversationId = existingConversationResult.data?.conversation_id ?? null;
  const backHref = adminReturnTo
    ? adminReturnTo
    : navigation.from === "conversation" && navigation.conversation
      ? `/app/messages/${encodeURIComponent(navigation.conversation)}`
    : navigation.from === "introductions"
      ? "/app/introductions"
      : navigation.from === "setup"
        ? "/app/profile/setup"
        : navigation.from === "admin"
          ? "/app/admin"
          : "/app/discover";
  const backLabel = adminReturnTo
    ? t("app.profile.backInvestigation")
    : navigation.from === "conversation"
      ? t("app.profile.backConversation")
    : navigation.from === "introductions"
      ? t("app.profile.backIntroductions")
      : navigation.from === "setup"
        ? t("app.profile.backEditing")
        : navigation.from === "admin"
          ? t("app.profile.backAdmin")
          : t("app.profile.backDiscover");
  const location = typeof profile.location_label === "string" && profile.location_label.trim()
    ? profile.location_label.trim()
    : typeof profile.country === "string" && profile.country.trim()
      ? profile.country.trim()
      : null;
  const friendshipDestinations = Array.isArray(friendshipDestinationResult.data) ? friendshipDestinationResult.data : [];
  return <ProfileView profile={viewProfile} displayName={displayName} age={age} location={location ?? ""} activity={activity} responseRate={profile.response_rate_label ?? null} photo={photo} languages={languageResult.data ?? []} interests={interestResult.data ?? []} friendshipDestinations={friendshipDestinations} personality={personalityResult.data ?? null} communicationPreference={communicationModeResult.data ?? null} languageCompatibility={languageCompatibility} badges={badgeKeys(badgeResult.data)} blocked={Boolean(blockResult.data)} targetId={targetId} username={profile.username} reportControl={reportControl} isOwn={isOwn} backHref={backHref} backLabel={backLabel} reportError={navigation.error ?? null} reportSubmitted={navigation.reported === "1"} existingConversationId={existingConversationId} />;
}
