/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/ban-ts-comment */
// @ts-nocheck
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
  const { id } = await params;
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  const uid = data?.claims?.sub;
  if (!uid) redirect("/sign-in");

  if (!(await db.from("conversation_participants").select("conversation_id").eq("conversation_id", id).eq("user_id", uid).maybeSingle()).data) notFound();
  const conversationModeResult = await db.from("conversations").select("communication_mode").eq("id", id).maybeSingle();
  const conversationMode = conversationModeResult.data?.communication_mode === "snail_mail" ? "snail_mail" : "instant";
  const otherParticipant = (await db.from("conversation_participants").select("user_id").eq("conversation_id", id).neq("user_id", uid).maybeSingle()).data;
  const identityResult = otherParticipant ? await db.rpc("resolve_profile_identity", { target_user: otherParticipant.user_id }) : { data: null };
  const identityRows = identityResult.data;
  const otherIdentity = Array.isArray(identityRows) ? identityRows[0] ?? null : identityRows ?? null;
  const otherProfile = otherIdentity;
  const deletedOther = !otherParticipant;
  const publicResult = otherIdentity?.username ? await db.rpc("get_public_profile", { target_username: otherIdentity.username }) : { data: null };
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
        db.from("profiles").select("avatar_path").eq("id", uid).maybeSingle(),
      ])
    : [{ data: null }, { data: null }, { data: [] }, { data: [] }, { data: null }, { data: false }, { data: [] }, { data: null }];
  const otherCommunicationMode = otherCommunicationModeResult.data;
  const ownCommunicationMode = ownCommunicationModeResult.data;
  const blockedByMe = Boolean(blockResult.data);
  const pairBlocked = Boolean(pairBlockResult.data);
  const canComposeSnailMail = otherCommunicationMode !== "instant" && ownCommunicationMode !== "instant" && Boolean(otherCommunicationMode && ownCommunicationMode);
  const targetLanguageEntries: LanguageCompatibilityEntry[] = (languageResult.data ?? [])
    .map((language: any) => {
      const name = relationName(language.languages);
      return name ? { language_id: Number(language.language_id), name, proficiency: language.proficiency, purpose: language.purpose } : null;
    })
    .filter((language: LanguageCompatibilityEntry | null): language is LanguageCompatibilityEntry => Boolean(language) && Number.isSafeInteger(language.language_id));
  const viewerLanguageEntries: LanguageCompatibilityEntry[] = (ownLanguageResult.data ?? [])
    .map((language: any) => {
      const name = relationName(language.languages);
      return name ? { language_id: Number(language.language_id), name, proficiency: language.proficiency, purpose: language.purpose } : null;
    })
    .filter((language: LanguageCompatibilityEntry | null): language is LanguageCompatibilityEntry => Boolean(language) && Number.isSafeInteger(language.language_id));
  const languageCompatibility = languageResult.error || ownLanguageResult.error
    ? null
    : deriveLanguageCompatibility(viewerLanguageEntries, targetLanguageEntries);
  const contextLanguageDetails = (languageResult.data ?? [])
    .map((language: any) => {
      const name = relationName(language.languages);
      return name ? { languageId: Number(language.language_id), purpose: language.purpose, name, level: formatLanguageProficiency(language.proficiency, language.purpose) } : null;
    })
    .filter(Boolean);
  const contextLanguages = contextLanguageDetails.map((language: any) => language.name);
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

  const msgs = (await db.from("messages").select("id,body,created_at,sender_id,moderation_status").eq("conversation_id", id).order("created_at")).data ?? [];
  const snailMailResult = await db.rpc("list_snail_mail", { target_conversation: id });
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
  const openingIntroductionRow = (await db.from("conversation_introductions").select("id,icebreaker,created_at,sender_id").eq("conversation_id_legacy", id).eq("status", "replied").order("created_at", { ascending: true }).limit(1).maybeSingle()).data;
  const openingIntroduction = openingIntroductionRow ?? (() => {
    const deletedOpening = msgs.find((message: any) => message.sender_id === null);
    return deletedOpening ? { id: `deleted-opening-${deletedOpening.id}`, icebreaker: deletedOpening.body, created_at: deletedOpening.created_at, sender_id: null } : null;
  })();
  const { error, message, reported } = await searchParams;
  const readResult = await markRead(id);
  const readError = readResult?.error ?? null;
  const pendingMine = photoRequests.some((request: any) => request.requester_id === uid && request.status === "pending");
  const pendingTheirs = photoRequests.filter((request: any) => request.owner_id === uid && request.status === "pending");
  const photoCooldown = photoRequests.some((request: any) => request.requester_id === uid && request.owner_id === targetId && photoCooldownActive(request, now));
  const hasModerationReview = msgs.some((currentMessage: any) => currentMessage.moderation_status === "flagged_for_review");
  const reportControl = targetId ? <details className="mt-3"><summary className="cursor-pointer text-sm text-black/60 underline underline-offset-2">Report this profile</summary><form action={submitReport} className="mt-3 space-y-2"><input type="hidden" name="target_type" value="profile" /><input type="hidden" name="target_id" value={targetId} /><input type="hidden" name="return_to" value={`/app/messages/${encodeURIComponent(id)}`} /><label htmlFor="conversation-report-reason" className="sr-only">Report reason</label><select id="conversation-report-reason" name="reason" className="field w-full text-xs"><option value="spam">Spam</option><option value="scam/fraud">Scam or fraud</option><option value="harassment">Harassment</option><option value="sexual/inappropriate content">Sexual or inappropriate content</option><option value="hate/abuse">Hate or abuse</option><option value="fake profile/impersonation">Fake profile or impersonation</option><option value="underage concern">Underage concern</option><option value="other">Other</option></select><label htmlFor="conversation-report-details" className="sr-only">Report details</label><textarea id="conversation-report-details" name="details" className="field w-full text-xs" placeholder="Tell us what happened (optional)" /><button className="w-full rounded-md border border-black/15 px-3 py-2 text-xs text-black/65 hover:bg-black/[0.04]">Submit profile report</button></form></details> : null;

  return <main className="min-h-[calc(100vh-73px)] w-full bg-[#f7f5ef] px-4 py-6 text-[#16251f] sm:px-6 lg:px-8 xl:px-4 lg:py-8"><div className="mx-auto w-full max-w-[1320px]">
    <Link href="/app/messages" className="inline-flex items-center gap-2 text-sm font-medium text-[#087456] transition hover:text-[#075d46] hover:underline"><span aria-hidden="true">←</span> Back to messages</Link>
    {(error || message || readError) && <p role={error || readError ? "alert" : "status"} className={`mt-4 border-l-2 px-3 py-2 text-sm ${error || readError ? "border-red-400 text-red-700" : "border-[#087456] text-[#075d46]"}`}>{error ?? readError ?? message}</p>}
    {reported === "1" && <p role="status" className="mt-4 border-l-2 border-[#087456] px-3 py-2 text-sm text-[#075d46]">Thanks for letting us know. We&apos;ll review your report.</p>}

    <div className="mt-5 grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_355px] xl:items-start xl:gap-10">
      <div className="min-w-0">
        <header className="rounded-xl border border-[#deded5] bg-[#fbfaf6] px-5 py-5 sm:px-7 sm:py-6">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="flex min-w-0 items-start gap-4 sm:gap-5">
              {profileHref ? <Link href={profileHref} className="relative block h-20 w-20 shrink-0 overflow-hidden rounded-full border border-[#d8d3c7] bg-[#e5e9df] sm:h-[92px] sm:w-[92px]" aria-label={`View ${otherName} profile`}>{photoUrl ? <Image src={photoUrl} alt={`${otherName} profile photo`} fill sizes="92px" unoptimized={isSignedAvatarUrl(photoUrl)} className="object-cover" /> : <span className="flex h-full w-full items-center justify-center font-serif text-3xl text-[#557264]">◦</span>}</Link> : <div className="relative block h-20 w-20 shrink-0 overflow-hidden rounded-full border border-[#d8d3c7] bg-[#e5e9df] sm:h-[92px] sm:w-[92px]" aria-hidden="true"><span className="flex h-full w-full items-center justify-center font-serif text-3xl text-[#557264]">◦</span></div>}
              <div className="min-w-0 pt-1"><h1 className="font-serif text-[clamp(2rem,2.8vw,2.65rem)] leading-[1.02] tracking-[-0.04em] text-[#10231d]">{profileHref ? <Link href={profileHref} className="break-words hover:text-[#075d46] hover:underline">{otherName}{typeof (publicProfile.age ?? otherProfile?.age) === "number" ? `, ${publicProfile.age ?? otherProfile.age}` : ""}</Link> : otherName}</h1><div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-black/60">{location && <span>{location}</span>}{targetId && location && <span aria-hidden="true" className="text-black/25">•</span>}{targetId && <PresenceStatus userId={targetId} fallback={otherIdentity?.activity_status} visible={otherIdentity?.activity_status !== null} availability={otherIdentity?.availability} />}</div><div className="mt-2.5 flex flex-wrap gap-2">{contextLanguages.slice(0, 4).map((language: string) => <span key={language} className="inline-flex items-center gap-1.5 rounded-full border border-[#ded8cc] bg-[#fffdfa] px-2.5 py-1 text-xs text-black/60"><LanguageFlag name={language} />{language}</span>)}</div></div>
            </div>
            {targetId && <div className="flex shrink-0 items-start gap-2"><Link href={profileHref ?? "/app/messages"} className="rounded-md border border-[#d7d0c3] px-3 py-2 text-xs font-medium text-[#33443e] hover:bg-white/75">View profile</Link><details className="relative"><summary className="flex min-h-9 cursor-pointer list-none items-center rounded-md border border-[#d7d0c3] px-3 py-2 text-xs font-medium text-[#33443e] hover:bg-white/75">More actions <span className="ml-2 text-black/40" aria-hidden="true">⌄</span></summary><div className="absolute right-0 top-[calc(100%+6px)] z-20 w-56 rounded-md border border-black/10 bg-[#fffdfa] p-3 shadow-lg"><div><BlockControl blocked={blockedByMe} id={targetId} username={otherIdentity?.username ?? ""} /></div>{reportControl}</div></details></div>}
          </div>
          <div className="mt-6 grid gap-4 border-t border-black/10 pt-5 sm:grid-cols-3 sm:divide-x sm:divide-black/10"><div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-black/40">Activity</p><p className="mt-1 text-sm text-black/70">{otherIdentity?.activity_status ?? "Activity is private"}</p></div><div className="sm:pl-5"><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-black/40">Languages</p>{contextLanguageDetails.length ? <div className="mt-1 space-y-1 text-sm text-black/70">{contextLanguageDetails.map((language: any) => <p key={`${language.languageId}-${language.purpose ?? "unknown"}`} className="leading-5">{language.name}{language.level ? <span className="text-black/45"> · {language.level}</span> : null}</p>)}</div> : <p className="mt-1 text-sm text-black/50">Not listed</p>}{languageCompatibility && (languageCompatibility.sharedLanguages.length > 0 || languageCompatibility.exchangeLanguages.length > 0) && <div className="mt-3 border-t border-black/[0.08] pt-3 text-xs leading-5 text-[#075d46]" aria-label="Language compatibility">{languageCompatibility.sharedLanguages.length > 0 && <p><span className="font-medium">You both speak:</span> {languageCompatibility.sharedLanguages.join(", ")}</p>}{languageCompatibility.exchangeLanguages.length > 0 && <p className={languageCompatibility.sharedLanguages.length > 0 ? "mt-1 text-black/55" : "text-[#075d46]"}><span className="font-medium">Language exchange:</span> {languageCompatibility.exchangeLanguages.join(", ")}</p>}</div>}</div><div className="sm:pl-5"><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-black/40">Communication</p><div className="mt-1 space-y-1.5 text-sm text-black/70"><p className="flex items-center gap-2"><span aria-hidden="true" className={modeEnabled(otherCommunicationMode, "instant") ? "font-semibold text-[#087456]" : "font-semibold text-[#b05b4f]"}>{modeEnabled(otherCommunicationMode, "instant") ? "✓" : "✕"}</span><span>Instant Messaging</span><span className="sr-only">{modeEnabled(otherCommunicationMode, "instant") ? "available" : "unavailable"}</span></p><p className="flex items-center gap-2"><span aria-hidden="true" className={modeEnabled(otherCommunicationMode, "snail_mail") ? "font-semibold text-[#087456]" : "font-semibold text-[#b05b4f]"}>{modeEnabled(otherCommunicationMode, "snail_mail") ? "✓" : "✕"}</span><span>Snail Mail</span><span className="sr-only">{modeEnabled(otherCommunicationMode, "snail_mail") ? "available" : "unavailable"}</span></p></div></div></div>
          {targetId && <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-black/10 pt-3 text-sm">
            {pairBlocked && <p className="text-black/50" role="status">Photo access is unavailable while this block is active.</p>}
            {!pairBlocked && photoStateError && <p className="text-red-700" role="alert">Photo access status is unavailable. Please refresh and try again.</p>}
            {!pairBlocked && !photoStateError && photoGrant && <p className="font-medium text-[#075d46]">Photo access granted</p>}
            {!pairBlocked && !photoStateError && !photoGrant && pendingMine && <p className="text-black/50">Photo request pending</p>}
            {!pairBlocked && !photoStateError && !photoGrant && !pendingMine && photoCooldown && <p className="text-black/50" role="status">Your photo request was declined. Please wait before requesting again.</p>}
            {!pairBlocked && !photoStateError && !photoGrant && !pendingMine && !photoCooldown && <form action={requestPhotoAccess} className="inline"><input type="hidden" name="conversation_id" value={id} /><input type="hidden" name="owner_id" value={targetId} /><button className="rounded-md border border-[#087456]/30 px-3 py-1.5 text-sm text-[#075d46] hover:bg-[#087456]/[0.06]">Request to see photo</button></form>}
            {!pairBlocked && !photoStateError && pendingTheirs.length === 0 && ownGrant && <div className="flex items-center gap-3 text-sm text-black/55"><span>Photo access granted to {otherIdentity?.display_name ?? "them"}</span><form action={revokePhotoAccess}><input type="hidden" name="conversation_id" value={id} /><input type="hidden" name="viewer_id" value={targetId} /><button className="text-xs text-black/45 underline">Revoke access</button></form></div>}
            {!pairBlocked && !photoStateError && !photoGrant && !ownGrant && pendingTheirs.length === 0 && (ownPhotoAvailable ? <form action={grantPhotoAccess}><input type="hidden" name="conversation_id" value={id} /><input type="hidden" name="viewer_id" value={targetId} /><button className="text-xs text-[#075d46] underline">Show my photo</button></form> : <Link href="/app/profile/setup" className="text-xs text-[#075d46] underline">Add a photo to share yours</Link>)}
          </div>}
        </header>
        {hasModerationReview && <p className="mt-4 border-l-2 border-[#087456]/45 bg-[#edf0e8]/55 px-4 py-3 text-sm text-black/65" role="status">This conversation has content under moderation review.</p>}
        {conversationMode === "snail_mail" ? <section aria-labelledby="snail-mail-only-heading" className="rounded-xl border border-[#deded5] bg-[#fbfaf6] px-6 py-8 text-center sm:px-8"><h2 id="snail-mail-only-heading" className="font-serif text-2xl text-[#10231d]">Snail Mail exchange</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-black/55">This exchange uses letters rather than instant messages. Your letters appear in the Snail Mail panel.</p></section> : <ConversationThread conversationId={id} userId={uid} messages={msgs} introduction={openingIntroduction} pendingRequests={pairBlocked || photoStateError ? [] : pendingTheirs} otherName={otherName} otherUsername={otherIdentity?.username} messageSendBlocked={pairBlocked || messageStreak >= 3} messageSendBlockedReason={pairBlocked ? "Messaging is unavailable because one of you blocked the other." : undefined} />}
      </div>

      <aside className="min-w-0 space-y-5">
        <section className="rounded-xl border border-[#deded5] bg-[#fbfaf6] p-5 sm:p-6" aria-labelledby="about-person-heading"><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-[#087456]">A little context</p><h2 id="about-person-heading" className="mt-1 font-serif text-2xl text-[#10231d]">About {otherName.split(" ")[0]}</h2>{publicProfile.bio && <p className="mt-4 line-clamp-5 text-sm leading-6 text-black/65">{publicProfile.bio}</p>}{location && <div className="mt-5 border-t border-black/10 pt-4"><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#3b5147]">Location</p><p className="mt-2 text-sm text-black/65">{location}</p></div>}{contextInterests.length > 0 && <div className="mt-5 border-t border-black/10 pt-4"><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#3b5147]">Interests</p><div className="mt-3 flex flex-wrap gap-2">{contextInterests.map((interest: string) => <span key={interest} className="rounded-full border border-[#d7d0c3] bg-[#fffdfa] px-3 py-1.5 text-xs text-[#33443e]">{interest}</span>)}</div></div>}<Link href={profileHref ?? "/app/messages"} className="mt-6 inline-flex w-full items-center justify-center rounded-md border border-[#d7d0c3] px-4 py-2.5 text-sm font-medium text-[#075d46] hover:bg-white/75">View full profile <span aria-hidden="true" className="ml-2">→</span></Link></section>
        <SnailMailPanel compact conversationId={id} userId={uid} letters={snailMailLetters} now={currentTimestamp()} canCompose={canComposeSnailMail && !snailMailBlockedReason} composeBlockedReason={snailMailBlockedReason} />
      </aside>
    </div>
  </div></main>;
}
