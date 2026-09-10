/* eslint-disable @typescript-eslint/no-explicit-any */
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { markRead, requestPhotoAccess, revokePhotoAccess, grantPhotoAccess } from "@/app/app/messages/actions";
import { hasSnailMailArrived, isLostInTransit } from "@/app/app/messages/snailMailStory";
import { redirect, notFound } from "next/navigation";
import { PresenceStatus } from "@/app/PresenceProvider";
import BlockControl from "@/app/app/profile/BlockControl";
import { submitReport } from "@/app/app/reports/actions";
import LanguageFlag from "@/app/components/LanguageFlag";
import ConversationThread from "./ConversationThread";
import SnailMailPanel, { type SnailMailLetter } from "./SnailMailPanel";
import { isPrivateAvatarPath, isSignedAvatarUrl } from "@/lib/avatar";
import { deriveLanguageCompatibility, formatLanguageProficiency, type LanguageCompatibilityEntry } from "@/lib/language-compatibility";
import { getPageI18n } from "@/i18n/server";

const currentTimestamp = () => Date.now();
const PHOTO_REQUEST_COOLDOWN_MS = 72 * 60 * 60 * 1000;

function relationName(value: any) {
  const relation = Array.isArray(value) ? value[0] : value;
  return relation?.name?.trim() || null;
}

function modeEnabled(value: string | null | undefined, mode: "instant" | "snail_mail") {
  return value === "both" || value === mode;
}

function photoCooldownActive(request: any, now: number) {
  if (request?.status !== "declined") return false;
  const updatedAt = Date.parse(request.updated_at ?? request.created_at ?? "");
  return Number.isFinite(updatedAt) && updatedAt + PHOTO_REQUEST_COOLDOWN_MS > now;
}

export default async function Conversation({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; message?: string; reported?: string }> }) {
  const { locale, t } = await getPageI18n();
  const { id } = await params;
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  const uid = data?.claims?.sub;
  if (!uid) redirect("/sign-in");

  const membershipResult = await db.from("conversation_participants").select("conversation_id").eq("conversation_id", id).eq("user_id", uid).maybeSingle();
  if (membershipResult.error) throw membershipResult.error;
  if (!membershipResult.data) notFound();
  const conversationModeResult = await db.from("conversations").select("communication_mode").eq("id", id).maybeSingle();
  if (conversationModeResult.error) throw conversationModeResult.error;
  if (!conversationModeResult.data) notFound();
  const conversationMode = conversationModeResult.data.communication_mode === "snail_mail" ? "snail_mail" : "instant";
  const otherParticipantResult = await db.from("conversation_participants").select("user_id,last_read_at").eq("conversation_id", id).neq("user_id", uid).maybeSingle();
  if (otherParticipantResult.error) throw otherParticipantResult.error;
  const otherParticipant = otherParticipantResult.data;
  const identityResult = otherParticipant ? await db.rpc("resolve_profile_identity", { target_user: otherParticipant.user_id }) : { data: null, error: null };
  if (identityResult.error) throw identityResult.error;
  const identityRows = identityResult.data;
  const otherIdentity = Array.isArray(identityRows) ? identityRows[0] ?? null : identityRows ?? null;
  const otherProfile = otherIdentity;
  const deletedOther = !otherParticipant;
  const publicResult = otherIdentity?.username ? await db.rpc("get_public_profile", { target_username: otherIdentity.username }) : { data: null, error: null };
  const publicProfile = publicResult.data ?? {};
  const targetId = otherParticipant?.user_id ?? null;
  const otherName = deletedOther ? "Deleted user" : (publicProfile.display_name || otherIdentity?.display_name || otherIdentity?.username || "Conversation");
  const profileHref = otherIdentity?.username ? `/app/profile/${encodeURIComponent(otherIdentity.username)}?from=conversation&conversation=${encodeURIComponent(id)}` : null;

  const [otherCommunicationModeResult, ownCommunicationModeResult, languageResult, interestResult, blockResult, pairBlockResult, ownLanguageResult, ownProfileResult] = targetId
    ? await Promise.all([
        db.rpc("get_public_communication_mode", { target_user: targetId }),
        db.rpc("get_public_communication_mode", { target_user: uid }),
        db.from("profile_languages").select("language_id, languages(name), proficiency, purpose").eq("profile_id", targetId),
        db.from("profile_interests").select("interest_id, interests(name)").eq("profile_id", targetId),
        db.from("profile_blocks").select("blocked_id").eq("blocker_id", uid).eq("blocked_id", targetId).maybeSingle(),
        // The blocks table is intentionally owner-readable only. Use the
        // narrow, server-authoritative helper to detect a block created by
        // either participant for UI state; it does not expose who blocked
        // whom.
        db.rpc("users_are_blocked", { first_user: uid, second_user: targetId }),
        db.from("profile_languages").select("language_id, languages(name), proficiency, purpose").eq("profile_id", uid),
        db.from("profiles").select("avatar_path,country,country_code").eq("id", uid).maybeSingle(),
      ])
    : [{ data: null, error: null }, { data: null, error: null }, { data: [], error: null }, { data: [], error: null }, { data: null, error: null }, { data: false, error: null }, { data: [], error: null }, { data: null, error: null }];
  const otherCommunicationMode = otherCommunicationModeResult.data;
  const ownCommunicationMode = ownCommunicationModeResult.data;
  const blockedByMe = Boolean(blockResult.data);
  const pairBlocked = Boolean(pairBlockResult.data);
  const pairBlockStateUnavailable = Boolean(pairBlockResult.error);
  const canComposeSnailMail = !pairBlockStateUnavailable && otherCommunicationMode !== "instant" && ownCommunicationMode !== "instant" && Boolean(otherCommunicationMode && ownCommunicationMode);
  const targetLanguageEntries: LanguageCompatibilityEntry[] = (languageResult.data ?? []).flatMap((language: any): LanguageCompatibilityEntry[] => {
    const name = relationName(language.languages);
    const languageId = Number(language.language_id);
    return name && Number.isSafeInteger(languageId)
      ? [{ language_id: languageId, name, proficiency: language.proficiency, purpose: language.purpose }]
      : [];
  });
  const viewerLanguageEntries: LanguageCompatibilityEntry[] = (ownLanguageResult.data ?? []).flatMap((language: any): LanguageCompatibilityEntry[] => {
    const name = relationName(language.languages);
    const languageId = Number(language.language_id);
    return name && Number.isSafeInteger(languageId)
      ? [{ language_id: languageId, name, proficiency: language.proficiency, purpose: language.purpose }]
      : [];
  });
  const languageCompatibility = languageResult.error || ownLanguageResult.error
    ? null
    : deriveLanguageCompatibility(viewerLanguageEntries, targetLanguageEntries);
  const contextLanguageDetails = (languageResult.data ?? [])
    .map((language: any) => {
      const name = relationName(language.languages);
      return name ? { languageId: Number(language.language_id), purpose: language.purpose, name, level: formatLanguageProficiency(language.proficiency, language.purpose) } : null;
    })
    .filter(Boolean);
  const contextInterests = (interestResult.data ?? []).map((interest: any) => relationName(interest.interests)).filter(Boolean);
  const location = publicProfile.location_label ?? [publicProfile.city, publicProfile.country].filter(Boolean).join(", ");

  const photoRequestsResult = await db.from("profile_photo_access_requests").select("id,requester_id,owner_id,status,created_at,updated_at").eq("conversation_id", id).order("created_at", { ascending: false });
  const photoRequests = photoRequestsResult.data ?? [];
  const photoGrantResult = targetId ? await db.rpc("can_view_profile_photo", { owner_user: targetId, viewer_user: uid }) : { data: false, error: null };
  const photoGrant = Boolean(photoGrantResult.data);
  const ownGrantResult = targetId ? await db.from("profile_photo_access_grants").select("owner_id").eq("owner_id", uid).eq("viewer_id", targetId).maybeSingle() : { data: null, error: null };
  const ownGrant = ownGrantResult.data;
  const photoStateError = Boolean(publicResult.error || photoRequestsResult.error || photoGrantResult.error || ownGrantResult.error || ownProfileResult.error || pairBlockResult.error);
  const ownPhotoAvailable = Boolean(ownProfileResult.data?.avatar_path && isPrivateAvatarPath(ownProfileResult.data.avatar_path, uid));
  const now = currentTimestamp();
  let photoUrl: string | null = null;
  const path = publicProfile.avatar_path;
  if (photoGrant && path && isPrivateAvatarPath(path, targetId)) {
    photoUrl = (await db.storage.from("avatars").createSignedUrl(path, 3600)).data?.signedUrl ?? null;
  }

  const messagePageResult = await db.from("messages").select("id,body,created_at,sender_id,moderation_status,reply_to_message_id").eq("conversation_id", id).order("created_at", { ascending: false }).limit(51);
  const messageHistoryLoadFailed = Boolean(messagePageResult.error);
  const messagePage = messagePageResult.data ?? [];
  const hasOlderMessages = messagePage.length > 50;
  const msgs = messagePage.slice(0, 50).reverse();
  const snailMailResult = await db.rpc("list_snail_mail", { target_conversation: id });
  const snailMailLoadFailed = Boolean(snailMailResult.error);
  let conversationDataLoadFailed = messageHistoryLoadFailed || snailMailLoadFailed || pairBlockStateUnavailable;
  const snailMailLetters: SnailMailLetter[] = Array.isArray(snailMailResult.data) ? snailMailResult.data : [];
  const lastOtherMessageAt = [...msgs].reverse().find((currentMessage: any) => currentMessage.sender_id !== uid)?.created_at ?? null;
  const messageStreak = msgs.filter((currentMessage: any) => currentMessage.sender_id === uid && (!lastOtherMessageAt || currentMessage.created_at > lastOtherMessageAt)).length;
  const outgoingLetters = snailMailLetters.filter((letter) => letter.sender_id === uid);
  const hasLetterInTransit = outgoingLetters.some((letter) => !isLostInTransit(letter) && !hasSnailMailArrived(letter, now));
  const hasUnreadDeliveredLetter = outgoingLetters.some((letter) => hasSnailMailArrived(letter, now) && !letter.recipient_read_at);
  const snailMailBlockedReason = pairBlocked
    ? "Snail Mail is unavailable because one of you blocked the other."
    : hasLetterInTransit
    ? "Your last letter is still on its way. Please wait before sending another."
    : hasUnreadDeliveredLetter
      ? "Your last delivered letter is waiting to be opened."
      : null;
  const openingIntroductionResult = await db.from("conversation_introductions").select("id,icebreaker,created_at,sender_id").eq("conversation_id_legacy", id).eq("status", "replied").order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (openingIntroductionResult.error) conversationDataLoadFailed = true;
  const openingIntroductionRow = openingIntroductionResult.data;
  const deletedOpeningResult = openingIntroductionRow || openingIntroductionResult.error
    ? { data: null, error: null }
    : await db.from("messages").select("id,body,created_at,sender_id").eq("conversation_id", id).is("sender_id", null).order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (deletedOpeningResult.error) conversationDataLoadFailed = true;
  const deletedOpening = deletedOpeningResult.data;
  const openingIntroduction = openingIntroductionRow ?? (deletedOpening ? { id: `deleted-opening-${deletedOpening.id}`, icebreaker: deletedOpening.body, created_at: deletedOpening.created_at, sender_id: null } : null);
  const { error, message, reported } = await searchParams;
  const readResult = await markRead(id);
  const readError = readResult?.error ?? null;
  const pendingMine = photoRequests.some((request: any) => request.requester_id === uid && request.status === "pending");
  const pendingTheirs = photoRequests.filter((request: any) => request.owner_id === uid && request.status === "pending");
  const photoCooldown = photoRequests.some((request: any) => request.requester_id === uid && request.owner_id === targetId && photoCooldownActive(request, now));
  const moderationReviewResult = await db.from("messages").select("id").eq("conversation_id", id).eq("moderation_status", "flagged_for_review").limit(1).maybeSingle();
  if (moderationReviewResult.error) conversationDataLoadFailed = true;
  const hasModerationReview = Boolean(moderationReviewResult.data);
  const reportControl = targetId ? <details className="mt-3"><summary className="cursor-pointer text-sm text-black/60 underline underline-offset-2">{t("app.reports.profile")}</summary><form action={submitReport} className="mt-3 space-y-2"><input type="hidden" name="target_type" value="profile" /><input type="hidden" name="target_id" value={targetId} /><input type="hidden" name="return_to" value={`/app/messages/${encodeURIComponent(id)}`} /><label htmlFor="conversation-report-reason" className="sr-only">{t("app.reports.reason")}</label><select id="conversation-report-reason" name="reason" className="field w-full text-xs"><option value="spam">{t("app.reports.spam")}</option><option value="scam/fraud">{t("app.reports.scam")}</option><option value="harassment">{t("app.reports.harassment")}</option><option value="sexual/inappropriate content">{t("app.reports.sexual")}</option><option value="hate/abuse">{t("app.reports.hate")}</option><option value="fake profile/impersonation">{t("app.reports.fake")}</option><option value="underage concern">{t("app.reports.underage")}</option><option value="other">{t("app.reports.other")}</option></select><label htmlFor="conversation-report-details" className="sr-only">{t("app.reports.details")}</label><textarea id="conversation-report-details" name="details" className="field w-full text-xs" placeholder="Tell us what happened (optional)" /><button className="w-full rounded-md border border-black/15 px-3 py-2 text-xs text-black/65 hover:bg-black/[0.04]">{t("app.reports.profile")}</button></form></details> : null;

  return <main lang={locale} className="min-h-[calc(100vh-73px)] w-full bg-[#f7f5ef] px-4 py-6 text-primary sm:px-6 lg:px-8 xl:px-4 lg:py-8"><div className="mx-auto w-full max-w-[1320px]">
    <Link href="/app/messages" className="inline-flex items-center gap-2 text-sm font-medium text-brand transition hover:text-brand hover:underline"><span aria-hidden="true">←</span> {t("app.messages.back")}</Link>
    {(error || message || readError) && <p role={error || readError ? "alert" : "status"} className={`mt-4 border-l-2 px-3 py-2 text-sm ${error || readError ? "border-red-400 text-red-700" : "border-[#087456] text-brand"}`}>{error ?? readError ?? message}</p>}
    {conversationDataLoadFailed && <p role="alert" className="notice notice-error mt-4">{t("app.messages.conversationLoadError")}</p>}
    {reported === "1" && <p role="status" className="notice notice-success mt-4">{t("app.messages.reported")}</p>}

    <div className="mt-5 grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_355px] xl:items-start xl:gap-10">
      <div className="min-w-0">
        <header className="rounded-xl border border-[#deded5] bg-[#fbfaf6] px-5 py-5 sm:px-7 sm:py-6">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="flex min-w-0 items-start gap-4 sm:gap-5">
              {profileHref ? <Link href={profileHref} className="relative block h-20 w-20 shrink-0 overflow-hidden rounded-full border border-[#d8d3c7] bg-[#e5e9df] sm:h-[92px] sm:w-[92px]" aria-label={`View ${otherName} profile`}>{photoUrl ? <Image src={photoUrl} alt={`${otherName} profile photo`} fill sizes="92px" unoptimized={isSignedAvatarUrl(photoUrl)} className="object-cover" /> : <span className="flex h-full w-full items-center justify-center font-serif text-3xl text-muted">◦</span>}</Link> : <div className="relative block h-20 w-20 shrink-0 overflow-hidden rounded-full border border-[#d8d3c7] bg-[#e5e9df] sm:h-[92px] sm:w-[92px]" aria-hidden="true"><span className="flex h-full w-full items-center justify-center font-serif text-3xl text-muted">◦</span></div>}
              <div className="min-w-0 pt-1"><h1 className="font-serif text-[clamp(2rem,2.8vw,2.65rem)] leading-[1.02] tracking-[-0.04em] text-primary">{profileHref ? <Link href={profileHref} className="break-words hover:text-brand hover:underline">{otherName}{typeof (publicProfile.age ?? otherProfile?.age) === "number" ? `, ${publicProfile.age ?? otherProfile.age}` : ""}</Link> : otherName}</h1><div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-black/60">{location && <span>{location}</span>}{targetId && location && <span aria-hidden="true" className="text-black/25">•</span>}{targetId && <PresenceStatus userId={targetId} fallback={otherIdentity?.activity_status} visible={otherIdentity?.activity_status !== null} availability={otherIdentity?.availability} />}</div></div>
            </div>
            {targetId && <div className="flex shrink-0 items-start gap-2"><Link href={profileHref ?? "/app/messages"} className="rounded-md border border-[#d7d0c3] px-3 py-2 text-xs font-medium text-primary hover:bg-white/75">{t("app.messages.viewProfile")}</Link><details className="relative"><summary className="flex min-h-9 cursor-pointer list-none items-center rounded-md border border-[#d7d0c3] px-3 py-2 text-xs font-medium text-primary hover:bg-white/75">{t("app.messages.more")} <span className="ml-2 text-black/40" aria-hidden="true">⌄</span></summary><div className="absolute right-0 top-[calc(100%+6px)] z-20 w-56 rounded-md border border-black/10 bg-[#fffdfa] p-3 shadow-lg"><div><BlockControl blocked={blockedByMe} id={targetId} username={otherIdentity?.username ?? ""} /></div>{reportControl}</div></details></div>}
          </div>
          {targetId && <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-black/10 pt-3 text-sm">
            {pairBlocked && <p className="text-black/50" role="status">{t("app.messages.photoUnavailable")}</p>}
            {!pairBlocked && photoStateError && <p className="text-red-700" role="alert">{t("app.messages.photoStatusUnavailable")}</p>}
            {!pairBlocked && !photoStateError && photoGrant && <p className="font-medium text-brand">{t("app.messages.photoGranted")}</p>}
            {!pairBlocked && !photoStateError && !photoGrant && pendingMine && <p className="text-black/50">{t("app.messages.photoPending")}</p>}
            {!pairBlocked && !photoStateError && !photoGrant && !pendingMine && photoCooldown && <p className="text-black/50" role="status">{t("app.messages.photoDeclined")}</p>}
            {!pairBlocked && !photoStateError && !photoGrant && !pendingMine && !photoCooldown && <form action={requestPhotoAccess} className="inline"><input type="hidden" name="conversation_id" value={id} /><input type="hidden" name="owner_id" value={targetId} /><button className="rounded-md border border-[#087456]/30 px-3 py-1.5 text-sm text-brand hover:bg-[#087456]/[0.06]">{t("app.messages.requestPhoto")}</button></form>}
            {!pairBlocked && !photoStateError && pendingTheirs.length === 0 && ownGrant && <div className="flex items-center gap-3 text-sm text-black/55"><span>{t("app.messages.photoGrantedTo", { name: otherIdentity?.display_name ?? t("app.messages.them") })}</span><form action={revokePhotoAccess}><input type="hidden" name="conversation_id" value={id} /><input type="hidden" name="viewer_id" value={targetId} /><button className="text-xs text-black/45 underline">{t("app.messages.revoke")}</button></form></div>}
            {!pairBlocked && !photoStateError && !photoGrant && !ownGrant && pendingTheirs.length === 0 && (ownPhotoAvailable ? <form action={grantPhotoAccess}><input type="hidden" name="conversation_id" value={id} /><input type="hidden" name="viewer_id" value={targetId} /><button className="text-xs text-brand underline">{t("app.messages.showPhoto")}</button></form> : <Link href="/app/profile/setup" className="text-xs text-brand underline">{t("app.messages.addPhoto")}</Link>)}
          </div>}
        </header>
        {hasModerationReview && <p className="mt-4 border-l-2 border-[#087456]/45 bg-[#edf0e8]/55 px-4 py-3 text-sm text-black/65" role="status">{t("app.messages.moderation")}</p>}
        {conversationMode === "snail_mail" ? <section aria-labelledby="snail-mail-only-heading" className="rounded-xl border border-[#deded5] bg-[#fbfaf6] px-6 py-8 text-center sm:px-8"><h2 id="snail-mail-only-heading" className="section-title">{t("app.messages.snailExchange")}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-black/55">{t("app.messages.snailExchangeBody")}</p></section> : <ConversationThread conversationId={id} userId={uid} messages={msgs} hasOlderMessages={hasOlderMessages} historyLoadFailed={messageHistoryLoadFailed} introduction={openingIntroduction} pendingRequests={pairBlocked || photoStateError ? [] : pendingTheirs} otherName={otherName} otherUsername={otherIdentity?.username} otherUserId={targetId} initialOtherLastReadAt={otherParticipant?.last_read_at ?? null} messageSendBlocked={pairBlocked || pairBlockStateUnavailable || messageStreak >= 3} messageSendBlockedReason={pairBlocked ? "Messaging is unavailable because one of you blocked the other." : pairBlockStateUnavailable ? t("app.messages.conversationLoadError") : undefined} />}
      </div>

      <aside className="min-w-0 space-y-5">
        <section className="rounded-xl border border-[#deded5] bg-[#fbfaf6] p-5 sm:p-6" aria-labelledby="about-person-heading"><p className="eyebrow">{t("app.messages.context")}</p><h2 id="about-person-heading" className="section-title mt-1">About {otherName.split(" ")[0]}</h2>{publicProfile.bio && <p className="mt-4 line-clamp-5 text-sm leading-6 text-black/65">{publicProfile.bio}</p>}{location && <div className="mt-5 border-t border-black/10 pt-4"><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-primary">{t("app.messages.location")}</p><p className="mt-2 text-sm text-black/65">{location}</p></div>}<div className="mt-5 border-t border-black/10 pt-4"><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-primary">{t("app.messages.communication")}</p><div className="mt-2 space-y-1.5 text-sm text-black/70"><p className="flex items-center gap-2"><span aria-hidden="true" className={modeEnabled(otherCommunicationMode, "instant") ? "font-semibold text-brand" : "font-semibold text-[#b05b4f]"}>{modeEnabled(otherCommunicationMode, "instant") ? "✓" : "✕"}</span><span>{t("app.messages.instantMessaging")}</span><span className="sr-only">{modeEnabled(otherCommunicationMode, "instant") ? "available" : "unavailable"}</span></p><p className="flex items-center gap-2"><span aria-hidden="true" className={modeEnabled(otherCommunicationMode, "snail_mail") ? "font-semibold text-brand" : "font-semibold text-[#b05b4f]"}>{modeEnabled(otherCommunicationMode, "snail_mail") ? "✓" : "✕"}</span><span>{t("app.messages.snail")}</span><span className="sr-only">{modeEnabled(otherCommunicationMode, "snail_mail") ? "available" : "unavailable"}</span></p></div></div><div className="mt-5 border-t border-black/10 pt-4"><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-primary">{t("app.messages.languages")}</p>{contextLanguageDetails.length ? <div className="mt-2 space-y-1 text-sm text-black/70">{contextLanguageDetails.map((language: any) => <p key={`${language.languageId}-${language.purpose ?? "unknown"}`} className="leading-5"><span className="inline-flex items-center gap-1.5"><LanguageFlag name={language.name} />{language.name}</span>{language.level ? <span className="text-black/45"> · {language.level}</span> : null}</p>)}</div> : <p className="mt-2 text-sm text-black/50">{t("app.messages.notListed")}</p>}{languageCompatibility && (languageCompatibility.sharedLanguages.length > 0 || languageCompatibility.exchangeLanguages.length > 0) && <div className="mt-3 border-t border-black/[0.08] pt-3 text-xs leading-5 text-brand" aria-label="Language compatibility">{languageCompatibility.sharedLanguages.length > 0 && <p><span className="font-medium">{t("app.messages.bothSpeak")}</span> {languageCompatibility.sharedLanguages.join(", ")}</p>}{languageCompatibility.exchangeLanguages.length > 0 && <p className={languageCompatibility.sharedLanguages.length > 0 ? "mt-1 text-black/55" : "text-brand"}><span className="font-medium">{t("app.messages.languageExchange")}</span> {languageCompatibility.exchangeLanguages.join(", ")}</p>}</div>}</div>{contextInterests.length > 0 && <div className="mt-5 border-t border-black/10 pt-4"><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-primary">{t("app.messages.interests")}</p><div className="mt-3 flex flex-wrap gap-2">{contextInterests.map((interest: string) => <span key={interest} className="rounded-full border border-[#d7d0c3] bg-[#fffdfa] px-3 py-1.5 text-xs text-primary">{interest}</span>)}</div></div>}<Link href={profileHref ?? "/app/messages"} className="mt-6 inline-flex w-full items-center justify-center rounded-md border border-[#d7d0c3] px-4 py-2.5 text-sm font-medium text-brand hover:bg-white/75">{t("app.messages.viewFullProfile")} <span aria-hidden="true" className="ml-2">→</span></Link></section>
        <SnailMailPanel compact conversationId={id} userId={uid} letters={snailMailLetters} now={currentTimestamp()} loadFailed={snailMailLoadFailed} canCompose={!snailMailLoadFailed && !pairBlockStateUnavailable && canComposeSnailMail && !snailMailBlockedReason} composeBlockedReason={snailMailLoadFailed ? t("app.messages.snailLoadError") : pairBlockStateUnavailable ? t("app.messages.conversationLoadError") : snailMailBlockedReason} viewerCountry={ownProfileResult.data?.country ?? null} otherCountry={publicProfile.country ?? null} />
      </aside>
    </div>
  </div></main>;
}
