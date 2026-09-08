"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { isPrivateAvatarPath } from "@/lib/avatar";
import { hasCompletedProfile, onboardingNextStep } from "@/lib/profile-completeness";

type ActionError = { code?: string | null; message?: string | null } | null;

function safeProfileError(error: ActionError, fallback = "We couldn't save your profile changes. Please try again.") {
  if (!error) return fallback;
  if (error.code === "23505" || error.message?.toLowerCase().includes("username")) return "That username is already taken.";
  if (error.message?.toLowerCase().includes("age") || error.message?.toLowerCase().includes("18") || error.message?.toLowerCase().includes("underage")) return "You must be at least 18 years old to use pen-pals.net.";
  if (error.message?.toLowerCase().includes("quote")) return "Please add a quote between 1 and 240 characters.";
  if (error.message?.toLowerCase().includes("language")) return "Please review your language selections.";
  if (error.message?.toLowerCase().includes("interest")) return "Please review your interest selections.";
  return fallback;
}

function profileErrorRedirect(message: string, appeal = false): never {
  redirect(`/app/profile/setup?error=${encodeURIComponent(message)}${appeal ? "&appeal=1" : ""}`);
}

function generatedUsernameCandidates(displayName: string, userId: string) {
  const base = displayName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
  const safeBase = base.length >= 3 ? base : "penpal";
  const suffix = userId.replace(/-/g, "").slice(0, 8).toLowerCase();
  const unique = `${safeBase.slice(0, 24 - suffix.length - 1)}_${suffix}`;
  return [...new Set([safeBase, unique])];
}

function isUsernameConflict(error: ActionError) {
  return error?.code === "23505" || /username.*(taken|unique|duplicate)|duplicate key/i.test(error?.message ?? "");
}

// A new account does not have a profile row until the first profile save, but
// the setup screen lets people choose a photo before that save. Keep the
// freshly uploaded, owner-scoped path in a short-lived httpOnly cookie and
// attach it atomically enough for the next profile save to pick it up.
const PENDING_AVATAR_COOKIE = "penpals_pending_avatar";

function clearPendingAvatar(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  cookieStore.set(PENDING_AVATAR_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/app/profile/setup",
    maxAge: 0,
  });
}

export async function saveProfile(formData: FormData) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const uid = claimsData?.claims?.sub;
  if (!uid) redirect("/sign-in");

  const display_name = String(formData.get("display_name") ?? "").trim();
  const birth_date = String(formData.get("birth_date") ?? "");

  // Read ownership state once so partial onboarding saves can preserve legacy
  // values while still allowing a new member to satisfy only the entry
  // minimum. The database keeps the legacy non-null columns; these neutral
  // defaults are not used as public profile claims and can be edited later.
  const { data: existingProfile, error: profileReadError } = await supabase
    .from("profiles")
    .select("id,username,gender,bio,quote,looking_for")
    .eq("id", uid)
    .maybeSingle();
  if (profileReadError) profileErrorRedirect("We couldn't load your profile. Please refresh and try again.");
  const gender = String(formData.get("gender") ?? "").trim() || existingProfile?.gender?.trim() || "prefer_not_to_say";
  const country = String(formData.get("country") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const bio = String(formData.get("bio") ?? "").trim();
  const quote = String(formData.get("quote") ?? "").trim();
  const looking_for = String(formData.get("looking_for") ?? "").trim() || existingProfile?.looking_for?.trim() || "friendship";

  const optionalProfileChoice = (name: string) => {
    const value = String(formData.get(name) ?? "").trim().toLowerCase();
    return value || null;
  };
  const connectionGoals = [...new Set(formData.getAll("connection_goals").map((value) => String(value).trim().toLowerCase()).filter(Boolean))];
  const socialStyle = optionalProfileChoice("social_style");
  const dailyRhythm = optionalProfileChoice("daily_rhythm");
  const environmentPreference = optionalProfileChoice("environment_preference");
  const travelStyle = optionalProfileChoice("travel_style");
  const pets = optionalProfileChoice("pets");
  const conversationStyle = optionalProfileChoice("conversation_style");
  const replyPace = optionalProfileChoice("reply_pace");

  let languages: unknown;
  try {
    languages = JSON.parse(String(formData.get("languages") ?? "[]"));
  } catch {
    profileErrorRedirect("We couldn't use those language choices. Please choose them again.");
  }
  if (!Array.isArray(languages)) profileErrorRedirect("We couldn't use those language choices. Please choose them again.");

  const rawInterests = String(formData.get("interests") ?? "").trim();
  const interestTokens = rawInterests ? rawInterests.split(",").map((value) => value.trim()) : [];
  if (interestTokens.some((value) => !/^\d+$/.test(value))) profileErrorRedirect("We couldn't use those interests. Please choose them again.");
  const interests = [...new Set(interestTokens.filter(Boolean).map(Number))];

  const cookieStore = await cookies();
  const pendingAvatarPath = cookieStore.get(PENDING_AVATAR_COOKIE)?.value ?? null;
  const usablePendingAvatar = isPrivateAvatarPath(pendingAvatarPath, uid) ? pendingAvatarPath : null;

  const countryCode = String(formData.get("country_code") ?? "").trim().toUpperCase() || null;
  const regionCode = String(formData.get("region_code") ?? "").trim().toUpperCase() || null;
  const localityValue = String(formData.get("locality_id") ?? "").trim();
  const localityId = localityValue && /^\d+$/.test(localityValue) ? Number(localityValue) : null;
  const locationPrecision = String(formData.get("location_precision") ?? "locality").trim().toLowerCase();
  let friendshipDestinations: unknown;
  try {
    friendshipDestinations = JSON.parse(String(formData.get("friendship_destinations") ?? "[]"));
  } catch {
    profileErrorRedirect("We couldn't use those destinations. Please choose them again.");
  }
  if (!Array.isArray(friendshipDestinations)) profileErrorRedirect("We couldn't use those destinations. Please choose them again.");

  const usernameCandidates = existingProfile?.username
    ? [existingProfile.username.trim().toLowerCase()]
    : generatedUsernameCandidates(display_name, uid);
  for (const username of usernameCandidates) {
    const { data: saveResult, error } = await supabase.rpc("save_profile", {
      p_username: username,
      p_display_name: display_name,
      p_birth_date: birth_date,
      p_gender: gender,
      p_country: country,
      p_city: city,
      p_bio: bio,
      p_quote: quote,
      p_looking_for: looking_for,
      p_languages: languages,
      p_interests: interests,
      p_country_code: countryCode,
      p_region_code: regionCode,
      p_locality_id: localityId,
      p_location_precision: locationPrecision,
      p_friendship_destinations: friendshipDestinations,
      p_social_style: socialStyle,
      p_daily_rhythm: dailyRhythm,
      p_environment_preference: environmentPreference,
      p_travel_style: travelStyle,
      p_pets: pets,
      p_connection_goals: connectionGoals,
      p_conversation_style: conversationStyle,
      p_reply_pace: replyPace,
    });
    if (!existingProfile && isUsernameConflict(error) && username !== usernameCandidates.at(-1)) continue;
    if (error) profileErrorRedirect(safeProfileError(error));
    if (saveResult === "underage") profileErrorRedirect("You must be at least 18 years old to use pen-pals.net.");
    if (saveResult === "restricted" || saveResult === "cooldown") profileErrorRedirect("This email cannot currently be used to create an account.", saveResult === "restricted");
    // The shared app layout decides whether navigation is available. Refresh
    // it after persisted profile changes so completion and edits are reflected
    // immediately instead of retaining the onboarding shell until a reload.
    revalidatePath("/app", "layout");
    if (usablePendingAvatar) {
      const { error: avatarAttachError } = await supabase.from("profiles").update({ avatar_path: usablePendingAvatar }).eq("id", uid);
      if (avatarAttachError) profileErrorRedirect("Your profile was saved, but we couldn't attach that photo. Please try uploading it again.");
      clearPendingAvatar(cookieStore);
    }
    const savedEntryProfile = { username, display_name, birth_date, country };
    const nextStep = onboardingNextStep(savedEntryProfile, languages.length, interests.length);
    if (!hasCompletedProfile(savedEntryProfile, languages.length, interests.length) && nextStep) {
      redirect(`/app/profile/setup?saved=1#${nextStep}`);
    }
    redirect("/app");
  }
  profileErrorRedirect("We couldn't save your profile changes. Please try again.");
}

export async function uploadAvatar(formData: FormData) {
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  const uid = data?.claims?.sub;
  if (!uid) redirect("/sign-in");
  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0 || file.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    profileErrorRedirect("Use a JPG, PNG, or WebP image under 5 MB.");
  }
  const path = `${uid}/${crypto.randomUUID()}.${file.type.split("/")[1]}`;
  const { error: uploadError } = await db.storage.from("avatars").upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) profileErrorRedirect(safeProfileError(uploadError, "We couldn't upload that photo."));
  const cookieStore = await cookies();
  const { data: existingProfile, error: profileReadError } = await db.from("profiles").select("id").eq("id", uid).maybeSingle();
  if (profileReadError) {
    await db.storage.from("avatars").remove([path]);
    profileErrorRedirect("We couldn't load your profile for the new photo.");
  }
  if (!existingProfile) {
    const previousPending = cookieStore.get(PENDING_AVATAR_COOKIE)?.value;
    if (previousPending && isPrivateAvatarPath(previousPending, uid) && previousPending !== path) await db.storage.from("avatars").remove([previousPending]);
    cookieStore.set(PENDING_AVATAR_COOKIE, path, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/app/profile/setup",
      maxAge: 60 * 60,
    });
    redirect("/app/profile/setup");
  }
  const { error: profileError } = await db.from("profiles").update({ avatar_path: path }).eq("id", uid);
  if (profileError) {
    await db.storage.from("avatars").remove([path]);
    profileErrorRedirect("We couldn't save the new photo.");
  }
  clearPendingAvatar(cookieStore);
  redirect("/app/profile/setup");
}

export async function removeAvatar() {
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  const uid = data?.claims?.sub;
  if (!uid) redirect("/sign-in");
  const { data: profile, error: profileReadError } = await db.from("profiles").select("avatar_path").eq("id", uid).maybeSingle();
  if (profileReadError) profileErrorRedirect("We couldn't load your current photo.");
  if (!profile?.avatar_path) redirect("/app/profile/setup");
  const { error: profileUpdateError } = await db.from("profiles").update({ avatar_path: null }).eq("id", uid);
  if (profileUpdateError) profileErrorRedirect("We couldn't remove your photo.");
  if (isPrivateAvatarPath(profile.avatar_path, uid)) {
    const { error: storageError } = await db.storage.from("avatars").remove([profile.avatar_path]);
    if (storageError) profileErrorRedirect("Your photo was hidden, but old storage cleanup failed.");
  }
  redirect("/app/profile/setup");
}

export async function savePrivacy(formData: FormData) {
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  const uid = data?.claims?.sub;
  if (!uid) redirect("/sign-in");

  // Settings only submits after a successful privacy read. Re-check that state
  // here so stale/hand-crafted forms cannot overwrite unknown privacy values.
  if (formData.get("settings_loaded") !== "1") redirect(`/app/settings?error=${encodeURIComponent("We couldn't load your privacy settings. Please refresh and try again.")}`);
  const { data: currentPrivacy, error: privacyReadError } = await db.from("profiles").select("id,profile_visibility,show_city,show_activity_status,show_response_rate,accepting_new_conversations,introduction_scope,availability,inactive_mode").eq("id", uid).maybeSingle();
  if (privacyReadError || !currentPrivacy) redirect(`/app/settings?error=${encodeURIComponent("We couldn't load your privacy settings. Please refresh and try again.")}`);
  const { error: exclusionsReadError } = await db.from("profile_introduction_country_exclusions").select("country_code").eq("profile_id", uid);
  if (exclusionsReadError) redirect(`/app/settings?error=${encodeURIComponent("We couldn't load your privacy settings. Please refresh and try again.")}`);

  const rawCountries = formData.getAll("excluded_countries").map((value) => String(value).trim().toUpperCase()).filter(Boolean);
  if (rawCountries.some((value) => !/^[A-Z]{2,3}$/.test(value))) redirect("/app/settings?error=Invalid country exclusion");

  const { error } = await db.rpc("save_privacy_settings", {
    p_profile_visibility: String(formData.get("profile_visibility") ?? "authenticated_only"),
    p_show_city: formData.get("show_city") === "on",
    p_show_activity_status: formData.get("show_activity_status") === "on",
    p_show_response_rate: formData.get("show_response_rate") === "on",
    p_accepting_new_conversations: formData.get("accepting_new_conversations") === "on",
    p_introduction_scope: String(formData.get("introduction_scope") ?? "everyone"),
    p_availability: String(formData.get("availability") ?? "available"),
    p_country_codes: [...new Set(rawCountries)],
    p_inactive_mode: formData.get("inactive_mode") === "on",
  });
  if (error) redirect(`/app/settings?error=${encodeURIComponent(error.message?.includes("country") ? "Invalid country exclusion" : "We couldn't save your privacy settings.")}`);
  redirect("/app/settings");
}

export async function saveCommunicationPreferences(formData: FormData) {
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  if (!data?.claims?.sub) redirect("/sign-in");
  const allowInstant = formData.get("allow_instant_messages") === "on";
  const allowSnailMail = formData.get("allow_snail_mail") === "on";
  const { error } = await db.rpc("save_communication_preferences", {
    p_allow_instant_messages: allowInstant,
    p_allow_snail_mail: allowSnailMail,
  });
  if (error) {
    const message = error.message?.includes("at least one")
      ? "Keep at least one communication mode enabled."
      : "We couldn't save your communication preferences.";
    redirect(`/app/settings?error=${encodeURIComponent(message)}`);
  }
  redirect("/app/settings?communication=saved");
}

export async function deactivateAccount() {
  const db = await createClient();
  const { error } = await db.rpc("deactivate_account");
  if (error) redirect(`/app/settings?error=${encodeURIComponent("We couldn't deactivate your account.")}`);
  redirect("/");
}

export async function reactivateAccount() {
  const db = await createClient();
  const { error } = await db.rpc("reactivate_account");
  if (error) redirect(`/reactivate?error=${encodeURIComponent("We couldn't reactivate your account.")}`);
  redirect("/app/profile/setup");
}

export async function blockUser(formData: FormData) {
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  if (!data?.claims?.sub) redirect("/sign-in");
  const { error } = await db.from("profile_blocks").upsert({ blocker_id: data.claims.sub, blocked_id: String(formData.get("blocked_id")) });
  if (error) redirect(`/profile/${String(formData.get("username"))}?error=${encodeURIComponent("That action isn't available right now.")}`);
  redirect(`/profile/${String(formData.get("username"))}`);
}

export async function unblockUser(formData: FormData) {
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  if (!data?.claims?.sub) redirect("/sign-in");
  const { error } = await db.from("profile_blocks").delete().eq("blocker_id", data.claims.sub).eq("blocked_id", String(formData.get("blocked_id")));
  if (error) redirect(`/app/settings/blocked?error=${encodeURIComponent("That action isn't available right now.")}`);
  redirect("/app/settings");
}
