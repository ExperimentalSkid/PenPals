/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import Image from "next/image";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isPrivateAvatarPath, isSignedAvatarUrl } from "@/lib/avatar";
import NotificationSort from "./NotificationSort";
import { ACTIONABLE_NOTIFICATION_TYPES } from "../notificationTypes";
import { getPageI18n } from "@/i18n/server";

// Message events intentionally remain outside this list. Conversations own
// their unread state, while this page is reserved for actionable updates.
const ACTIVE_TYPES = ACTIONABLE_NOTIFICATION_TYPES;
const REQUEST_TYPES = ["new_introduction", "photo_access_request", "support_ticket_created", "support_ticket_user_reply"];
const UPDATE_TYPES = ["introduction_replied", "introduction_declined", "photo_access_granted", "support_ticket_public_reply", "support_ticket_waiting_user", "support_ticket_resolved", "support_ticket_reopened", "profile_verification_reverify"];
const STAFF_SUPPORT_TYPES = ["support_ticket_created", "support_ticket_user_reply"];

type SearchValue = string | string[] | undefined;

function first(value: SearchValue) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

async function openNotification(notificationId: string) {
  "use server";
  const db = await createClient();
  const { data: claimsData } = await db.auth.getClaims();
  const uid = claimsData?.claims?.sub;
  if (!uid) redirect("/sign-in");

  const { data: notification, error: notificationError } = await db
    .from("notifications")
    .select("id,type,related_id")
    .eq("id", notificationId)
    .eq("user_id", uid)
    .maybeSingle();
  if (notificationError || !notification) redirect("/app/notifications?error=Notification%20is%20no%20longer%20available");
  // Legacy rows (including new_message) remain in the database for migration
  // compatibility, but are intentionally not part of this action surface.
  if (!ACTIVE_TYPES.includes(notification.type)) redirect("/app/notifications?error=That%20notification%20is%20no%20longer%20available");

  // A new-introduction notification is only actionable while the introduction
  // is still pending. Replying to or declining an introduction handles the
  // request, so an older unread notification must not remain actionable.
  if (notification.type === "new_introduction") {
    const { data: introduction, error: introductionError } = await db
      .from("conversation_introductions")
      .select("status,recipient_id")
      .eq("id", notification.related_id)
      .maybeSingle();
    if (introductionError || !introduction || introduction.recipient_id !== uid || introduction.status !== "pending") {
      const { error: staleReadError } = await db
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", notification.id)
        .eq("user_id", uid)
        .is("read_at", null);
      if (staleReadError) redirect("/app/notifications?error=We%20couldn't%20clear%20that%20handled%20notification");
      revalidatePath("/app", "layout");
      redirect("/app/notifications");
    }
  }

  const { error: readError } = await db
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notification.id)
    .eq("user_id", uid)
    .is("read_at", null);
  if (readError) redirect("/app/notifications?error=We%20couldn't%20mark%20that%20notification%20as%20read");

  if (STAFF_SUPPORT_TYPES.includes(notification.type)) {
    const { data: isStaff } = await db.rpc("is_moderator");
    if (!isStaff) redirect("/app/notifications?error=That%20notification%20is%20no%20longer%20available");
    revalidatePath("/app", "layout");
    redirect(`/app/admin/support/${notification.related_id}?return_to=%2Fapp%2Fadmin%2Fsupport`);
  }

  if (notification.type === "profile_verification_reverify") {
    revalidatePath("/app", "layout");
    redirect("/app/settings#verification");
  }

  if (notification.type.startsWith("support_ticket_")) {
    revalidatePath("/app", "layout");
    redirect(`/app/support/requests/${notification.related_id}`);
  }

  if (notification.type === "photo_access_request" || notification.type === "photo_access_granted") {
    const { data: request } = await db
      .from("profile_photo_access_requests")
      .select("conversation_id")
      .eq("id", notification.related_id)
      .maybeSingle();
    revalidatePath("/app", "layout");
    redirect(request?.conversation_id ? `/app/messages/${request.conversation_id}` : "/app/notifications");
  }

  const { data: introduction } = await db
    .from("conversation_introductions")
    .select("conversation_id_legacy")
    .eq("id", notification.related_id)
    .maybeSingle();
  revalidatePath("/app", "layout");
  redirect(introduction?.conversation_id_legacy ? `/app/messages/${introduction.conversation_id_legacy}` : "/app/introductions");
}

function relativeTime(value: string, locale: string, t: (key: string, values?: Record<string, string | number>) => string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return t("app.notifications.justNow");
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 172800) return t("app.notifications.yesterday");
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

type NotificationIconName = "introduction" | "photo" | "mail" | "message" | "shield" | "bell";

function NotificationIcon({ name }: { name: NotificationIconName }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" {...common}>
      {name === "introduction" && <><path d="M6 19.5 4 21l.8-3.2A8.5 8.5 0 1 1 6 19.5Z" /><path d="M8 10.5h8M8 14h5" /></>}
      {name === "photo" && <><rect x="3.5" y="5.5" width="17" height="14" rx="2" /><circle cx="9" cy="10" r="1.4" /><path d="m5.5 17 4.2-4 3 2.6 2-1.8 3.8 3.2" /></>}
      {name === "mail" && <><rect x="3.5" y="5" width="17" height="14" rx="2" /><path d="m4.5 7 7.5 5 7.5-5" /></>}
      {name === "message" && <><path d="M5 18.5 3.5 21l3.9-1.4A9 9 0 1 0 5 18.5Z" /><path d="M8 10.5h8M8 14h5" /></>}
      {name === "shield" && <><path d="M12 3 20 6v5.5c0 4.7-3.1 7.8-8 9.5-4.9-1.7-8-4.8-8-9.5V6l8-3Z" /><path d="m8.5 12 2.2 2.2 4.8-5" /></>}
      {name === "bell" && <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z" /><path d="M10 21h4" /></>}
    </svg>
  );
}

function relation(value: any) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export default async function Notifications({ searchParams }: { searchParams?: Promise<Record<string, SearchValue>> }) {
  const { locale, t } = await getPageI18n();
  const db = await createClient();
  const { data: claimsData } = await db.auth.getClaims();
  const uid = claimsData?.claims?.sub;
  if (!uid) redirect("/sign-in");

  const params = searchParams ? await searchParams : {};
  const errorMessage = first(params.error);
  const requestedFilter = first(params.filter);
  const activeFilter = ["unread", "requests", "updates"].includes(requestedFilter) ? requestedFilter : "all";
  const requestedSort = first(params.sort);
  const activeSort = requestedSort === "oldest" ? "oldest" : "newest";

  const { data: rows, error: notificationsError } = await db
    .from("notifications")
    .select("id,type,related_id,created_at,read_at")
    .eq("user_id", uid)
    .is("read_at", null)
    .in("type", ACTIVE_TYPES)
    .order("created_at", { ascending: activeSort === "oldest" });
  const rawNotifications = rows ?? [];
  const introductionIds = rawNotifications
    .filter((row: any) => ["new_introduction", "introduction_replied", "introduction_declined"].includes(row.type))
    .map((row: any) => row.related_id);
  const { data: relatedIntroductions } = introductionIds.length
    ? await db.from("conversation_introductions").select("id,sender_id,recipient_id,icebreaker,conversation_id_legacy,status").in("id", introductionIds)
    : { data: [] };
  const introductionsById = new Map((relatedIntroductions ?? []).map((intro: any) => [intro.id, intro]));
  // Keep handled introduction requests out of the notification stream even
  // when an older row was created before the database trigger cleared it.
  const notifications = rawNotifications.filter((row: any) => {
    if (row.type !== "new_introduction") return true;
    const introduction = introductionsById.get(row.related_id);
    return introduction?.status === "pending" && introduction.recipient_id === uid;
  });
  const unreadCount = notifications.length;
  const requestCount = notifications.filter((row: any) => REQUEST_TYPES.includes(row.type)).length;
  const updateCount = notifications.filter((row: any) => UPDATE_TYPES.includes(row.type)).length;
  const visibleNotifications = activeFilter === "requests"
    ? notifications.filter((row: any) => REQUEST_TYPES.includes(row.type))
    : activeFilter === "updates"
      ? notifications.filter((row: any) => UPDATE_TYPES.includes(row.type))
      : notifications;

  const photoRequestIds = notifications.filter((row: any) => row.type === "photo_access_request" || row.type === "photo_access_granted").map((row: any) => row.related_id);
  const { data: relatedPhotoRequests } = photoRequestIds.length
    ? await db.from("profile_photo_access_requests").select("id,requester_id,owner_id,conversation_id").in("id", photoRequestIds)
    : { data: [] };

  const photoRequestsById = new Map((relatedPhotoRequests ?? []).map((request: any) => [request.id, request]));
  const personIds = [...new Set([
    ...(relatedIntroductions ?? []).flatMap((introduction: any) => [introduction.sender_id, introduction.recipient_id]),
    ...(relatedPhotoRequests ?? []).flatMap((request: any) => [request.requester_id, request.owner_id]),
  ].filter((personId: string) => personId && personId !== uid))];

  const profilesById = new Map<string, any>();
  await Promise.all(personIds.map(async (personId) => {
    const identityResult = await db.rpc("resolve_profile_identity", { target_user: personId });
    const identity = relation(identityResult.data);
    if (!identity) return;
    let photo: string | null = null;
    const { data: canViewPhoto } = await db.rpc("can_view_profile_photo", { owner_user: personId, viewer_user: uid });
    if (canViewPhoto && isPrivateAvatarPath(identity.avatar_path, personId)) {
      photo = (await db.storage.from("avatars").createSignedUrl(identity.avatar_path, 3600)).data?.signedUrl ?? null;
    }
    profilesById.set(personId, { ...identity, photo });
  }));

  const eventFor = (notification: any) => {
    if (notification.type === "support_ticket_created") return { kind: "system", icon: "bell" as const, person: null, personName: "pen-pals.net", title: t("app.notifications.newSupport"), context: t("app.notifications.newSupportContext"), action: t("app.notifications.openSupportInbox") };
    if (notification.type === "support_ticket_user_reply") return { kind: "system", icon: "message" as const, person: null, personName: "pen-pals.net", title: t("app.notifications.supportUserReply"), context: t("app.notifications.supportUserReplyContext"), action: t("app.notifications.openSupportTicket") };
    if (notification.type === "support_ticket_public_reply") return { kind: "system", icon: "message" as const, person: null, personName: "pen-pals.net", title: t("app.notifications.supportReply"), context: t("app.notifications.supportReplyContext"), action: t("app.notifications.openSupportRequest") };
    if (notification.type === "support_ticket_waiting_user") return { kind: "system", icon: "bell" as const, person: null, personName: "pen-pals.net", title: t("app.notifications.supportNeeds"), context: t("app.notifications.supportNeedsContext"), action: t("app.notifications.openSupportRequest") };
    if (notification.type === "support_ticket_resolved") return { kind: "system", icon: "shield" as const, person: null, personName: "pen-pals.net", title: t("app.notifications.supportResolved"), context: t("app.notifications.supportResolvedContext"), action: t("app.notifications.openSupportRequest") };
    if (notification.type === "support_ticket_reopened") return { kind: "system", icon: "bell" as const, person: null, personName: "pen-pals.net", title: t("app.notifications.supportReopened"), context: t("app.notifications.supportReopenedContext"), action: t("app.notifications.openSupportRequest") };
    if (notification.type === "profile_verification_reverify") return { kind: "system", icon: "shield" as const, person: null, personName: "pen-pals.net", title: t("app.notifications.verificationRenew"), context: t("app.notifications.verificationRenewContext"), action: t("app.notifications.reverify") };
    const intro = introductionsById.get(notification.related_id);
    const photoRequest = photoRequestsById.get(notification.related_id);
    const personId = notification.type === "new_introduction"
      ? intro?.sender_id
      : notification.type === "photo_access_request"
        ? photoRequest?.requester_id
        : notification.type === "photo_access_granted"
          ? photoRequest?.owner_id
          : intro?.recipient_id;
    const person = personId ? profilesById.get(personId) : null;
    const personName = person?.display_name ?? person?.username ?? t("app.notifications.deletedUser");
    if (notification.type === "new_introduction") return { kind: "person", icon: "introduction" as const, person, personName, title: t("app.notifications.newIntro", { name: personName }), context: intro?.icebreaker ? `“${intro.icebreaker}”` : t("app.notifications.readIntro"), action: t("app.notifications.openIntro") };
    if (notification.type === "introduction_replied") return { kind: "person", icon: "message" as const, person, personName, title: t("app.notifications.replied", { name: personName }), context: t("app.notifications.repliedContext"), action: intro?.conversation_id_legacy ? t("app.notifications.openConversation") : t("app.notifications.openIntroductions") };
    if (notification.type === "photo_access_request") return { kind: "person", icon: "photo" as const, person, personName, title: t("app.notifications.photoRequest", { name: personName }), context: t("app.notifications.photoRequestContext"), action: t("app.notifications.reviewRequest") };
    if (notification.type === "photo_access_granted") return { kind: "person", icon: "photo" as const, person, personName, title: t("app.notifications.photoGranted", { name: personName }), context: t("app.notifications.photoGrantedContext"), action: t("app.notifications.viewConversation") };
    if (notification.type === "introduction_declined") return { kind: "person", icon: "introduction" as const, person, personName, title: t("app.notifications.introDeclined", { name: personName }), context: t("app.notifications.introDeclinedContext"), action: t("app.notifications.openIntroductions") };
    return { kind: "system", icon: "shield" as const, person: null, personName: "pen-pals.net", title: t("app.notifications.yourUpdate"), context: t("app.notifications.yourUpdateContext") };
  };

  const filterHref = (filter: string) => {
    const query = new URLSearchParams();
    if (filter !== "all") query.set("filter", filter);
    if (activeSort !== "newest") query.set("sort", activeSort);
    const value = query.toString();
    return value ? `/app/notifications?${value}` : "/app/notifications";
  };

  return (
    <main lang={locale} className="min-h-full w-full bg-[#f7f5ef] px-6 py-10 text-primary sm:px-8 sm:py-12 lg:px-10 lg:py-14 xl:px-12 2xl:px-16">
      <div className="mx-auto w-full max-w-[1390px]">
        <header>
          <p className="eyebrow">{t("app.notifications.eyebrow")}</p>
          <div className="mt-4 flex items-center gap-4"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#e7eee2] text-brand" aria-hidden="true"><NotificationIcon name="bell" /></span><h1 className="page-title-display">{t("app.notifications.title")}</h1></div>
          <p className="mt-5 max-w-2xl text-lg leading-7 text-black/60 sm:text-xl">{t("app.notifications.intro")}</p>
        </header>

        {errorMessage && <p role="alert" className="notice notice-error mt-7">{errorMessage}</p>}
        {notificationsError && <p role="alert" className="notice notice-error mt-7">{t("app.notifications.loadError")}</p>}

        <div className="mt-9 flex flex-col gap-4 border-y border-black/10 py-4 sm:flex-row sm:items-center sm:justify-between">
          <nav aria-label={t("app.notifications.filters")} className="flex flex-wrap items-center gap-2 sm:gap-3">
            <Link href={filterHref("all")} aria-current={activeFilter === "all" ? "page" : undefined} className={`rounded-full border px-4 py-2 text-sm transition ${activeFilter === "all" ? "border-[#075d46] bg-[#075d46] font-semibold text-white" : "border-transparent text-black/60 hover:border-black/10 hover:text-brand"}`}>{t("app.notifications.all")}{unreadCount > 0 ? ` (${unreadCount})` : ""}</Link>
            <Link href={filterHref("unread")} aria-current={activeFilter === "unread" ? "page" : undefined} className={`rounded-full border px-4 py-2 text-sm transition ${activeFilter === "unread" ? "border-[#075d46] bg-[#075d46] font-semibold text-white" : "border-transparent text-black/60 hover:border-black/10 hover:text-brand"}`}>{t("app.notifications.unread")}{unreadCount > 0 ? ` (${unreadCount})` : ""}</Link>
            <Link href={filterHref("requests")} aria-current={activeFilter === "requests" ? "page" : undefined} className={`rounded-full border px-4 py-2 text-sm transition ${activeFilter === "requests" ? "border-[#075d46] bg-[#075d46] font-semibold text-white" : "border-transparent text-black/60 hover:border-black/10 hover:text-brand"}`}>{t("app.notifications.requests")}{requestCount > 0 ? ` (${requestCount})` : ""}</Link>
            <Link href={filterHref("updates")} aria-current={activeFilter === "updates" ? "page" : undefined} className={`rounded-full border px-4 py-2 text-sm transition ${activeFilter === "updates" ? "border-[#075d46] bg-[#075d46] font-semibold text-white" : "border-transparent text-black/60 hover:border-black/10 hover:text-brand"}`}>{t("app.notifications.updates")}{updateCount > 0 ? ` (${updateCount})` : ""}</Link>
          </nav>
          <NotificationSort activeSort={activeSort} activeFilter={activeFilter} />
        </div>

        <div className="mt-7 grid gap-7 lg:grid-cols-[minmax(0,1fr)_292px] lg:items-start">
          <section aria-label={t("app.notifications.list")} aria-live="polite" className="min-w-0 overflow-hidden rounded-xl border border-[#e1ded5] bg-[#fffdfa] shadow-[0_3px_14px_rgba(36,57,45,0.035)]">
            {visibleNotifications.map((notification: any) => {
              const event = eventFor(notification);
              const content = <>
                  <span className="flex min-w-0 items-center gap-4 sm:gap-5">
                  <span className="flex h-3 w-3 shrink-0 items-center justify-center" aria-hidden="true">{!notification.read_at && <span className="h-2.5 w-2.5 rounded-full bg-[#147d61]" />}</span>{!notification.read_at && <span className="sr-only">{t("app.notifications.unreadNotification")}</span>}
                  <span className="relative shrink-0">
                    {event.person ? <span className="relative block h-14 w-14 overflow-hidden rounded-full border border-[#ddd9ce] bg-[#e8ece4] sm:h-16 sm:w-16">
                      {event.person.photo ? <Image src={event.person.photo} alt={`${event.personName} profile photo`} fill sizes="64px" unoptimized={isSignedAvatarUrl(event.person.photo)} className="object-cover" /> : <span role="img" aria-label={`${event.personName} profile photo unavailable`} className="flex h-full items-center justify-center font-serif text-2xl text-muted">{event.personName.trim().charAt(0).toUpperCase() || "·"}</span>}
                    </span> : <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#e8eee4] text-brand sm:h-16 sm:w-16"><NotificationIcon name={event.icon} /></span>}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-[16px] leading-6 text-primary ${notification.read_at ? "font-medium" : "font-semibold"}`}>{event.title}</span>
                    <span className="mt-1 block line-clamp-2 text-[15px] leading-6 text-black/60">{event.context}</span>
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-3 sm:ml-4 sm:flex-col sm:items-end sm:justify-center sm:gap-2">
                  <time className="text-xs text-black/45 sm:whitespace-nowrap" dateTime={notification.created_at}>{relativeTime(notification.created_at, locale, t)}</time>
                  {event.action && <span className="inline-flex min-h-10 items-center justify-center rounded-md border border-[#6f9a88] px-3 py-2 text-sm font-medium text-brand transition group-hover:bg-[#edf3ed]">{event.action}</span>}
                </span>
              </>;
              return event.action ? <form action={openNotification.bind(null, notification.id)} key={notification.id} className="contents"><button type="submit" className={`group grid w-full gap-4 px-5 py-5 text-left transition hover:bg-[#f2f5ef] focus-visible:bg-[#f2f5ef] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#087456] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center ${notification.read_at ? "" : "bg-[#f4f7f1]/70"}`}>{content}</button></form> : <div key={notification.id} className={`grid gap-4 px-5 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center ${notification.read_at ? "" : "bg-[#f4f7f1]/70"}`}>{content}</div>;
            })}
            {!notificationsError && !notifications.length && <p className="px-6 py-14 text-sm text-black/55">{t("app.notifications.caughtUp")}</p>}
            {!notificationsError && notifications.length > 0 && !visibleNotifications.length && <p className="px-6 py-14 text-sm text-black/55">{t("app.notifications.caughtUp")}</p>}
          </section>

          <aside className="rounded-xl border border-[#e3e0d8] bg-[#fbfaf7] px-6 py-7 shadow-[0_3px_14px_rgba(36,57,45,0.025)] sm:px-7 sm:py-8">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#e7eee2] text-brand"><NotificationIcon name="mail" /></span>
            <h2 className="mt-7 font-serif text-2xl text-primary">{t("app.notifications.preferences")}</h2>
            <p className="mt-4 text-sm leading-6 text-black/65">{t("app.notifications.preferencesBody")}</p>
            <p className="mt-3 text-sm leading-6 text-black/65">{t("app.notifications.preferencesBody2")}</p>
            <Link href="/app/settings" className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-brand hover:underline">{t("app.notifications.manage")} <span aria-hidden="true" className="text-lg leading-none">→</span></Link>
          </aside>
        </div>

        <p className="mt-7 flex items-center gap-3 px-1 text-sm text-black/50"><span className="text-muted" aria-hidden="true"><NotificationIcon name="shield" /></span>{t("app.notifications.footer")}</p>
      </div>
    </main>
  );
}
