import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { LOCAL_DB_CONTAINER } from "./helpers/local-db.mjs";
import { createClient } from "@supabase/supabase-js";

const root = new URL("../", import.meta.url);
const envText = await readFile(new URL(".env.local", root), "utf8").catch(() => "");

function envValue(name) {
  const line = envText.split(/\r?\n/).find((entry) => entry.startsWith(`${name}=`));
  return process.env[name] || line?.slice(name.length + 1).trim() || "";
}

const supabaseUrl = envValue("NEXT_PUBLIC_SUPABASE_URL");
const publishableKey = envValue("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
const hasLocalDatabase = (() => {
  try {
    execFileSync("docker", ["inspect", LOCAL_DB_CONTAINER], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

function client() {
  return createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function signInFixture(t, email) {
  const db = client();
  const { data, error } = await db.auth.signInWithPassword({ email, password: process.env.PENPAL_LOCAL_TEST_PASSWORD || "demo" });
  if (error?.code === "invalid_credentials") { t.skip(`local Auth fixture ${email} is not seeded`); return null; }
  assert.equal(error, null, `${email} sign-in failed`);
  assert.ok(data.session, `${email} did not receive a session`);
  assert.ok(data.user?.email_confirmed_at, `${email} is not email-verified`);
  return db;
}

function assertNoError(error, context) {
  assert.equal(error, null, `${context}: ${error?.message || "request failed"}`);
}

async function savePrivacy(db, profile, countryCodes, inactive) {
  const { error } = await db.rpc("save_privacy_settings", {
    p_profile_visibility: profile.profile_visibility,
    p_show_city: profile.show_city,
    p_show_activity_status: profile.show_activity_status,
    p_show_response_rate: profile.show_response_rate,
    p_accepting_new_conversations: profile.accepting_new_conversations,
    p_introduction_scope: profile.introduction_scope,
    p_availability: profile.availability,
    p_country_codes: countryCodes,
    p_inactive_mode: inactive,
  });
  assertNoError(error, `save privacy (inactive=${inactive})`);
}

test("local Supabase integration exercises Auth, two-user RLS, block/pause/deactivation, private Storage, and staff RPC denial", { skip: !hasLocalDatabase || !supabaseUrl || !publishableKey }, async (t) => {
  const mika = await signInFixture(t, "mika@example.local");
  if (!mika) return;
  const yuna = await signInFixture(t, "yuna@example.local");
  if (!yuna) { await mika.auth.signOut(); return; }
  const sofia = await signInFixture(t, "sofia@example.local");
  if (!sofia) { await mika.auth.signOut(); await yuna.auth.signOut(); return; }
  const mikaId = (await mika.auth.getUser()).data.user?.id;
  const yunaId = (await yuna.auth.getUser()).data.user?.id;
  const sofiaId = (await sofia.auth.getUser()).data.user?.id;
  assert.match(mikaId || "", /^[0-9a-f-]{36}$/i);
  assert.match(yunaId || "", /^[0-9a-f-]{36}$/i);
  assert.match(sofiaId || "", /^[0-9a-f-]{36}$/i);

  const { data: mikaProfile, error: profileError } = await mika.from("profiles").select("username,display_name,birth_date,gender,bio,quote,looking_for,profile_visibility,show_city,show_activity_status,show_response_rate,accepting_new_conversations,introduction_scope,availability,inactive_mode,deactivated_at,country,country_code,region_code,locality_id,location_precision,city").eq("id", mikaId).single();
  assertNoError(profileError, "read own profile");
  assert.ok(mikaProfile, "seeded profile fixture missing");
  assert.equal(mikaProfile.deactivated_at, null, "seeded integration user must be active");

  // Normalized location integrity must hold for direct table writes as well
  // as the profile-save RPC.  Use a locality from another country and leave
  // the profile's country/region unchanged; the hierarchy trigger must reject
  // the cross-scope identifier without changing the stored profile.
  if (mikaProfile.country_code) {
    const { data: foreignLocality, error: localityError } = await mika
      .from("location_localities")
      .select("id,country_code")
      .neq("country_code", mikaProfile.country_code)
      .limit(1)
      .maybeSingle();
    assertNoError(localityError, "read foreign locality fixture");
    if (foreignLocality) {
      const { error: invalidLocationError } = await mika.from("profiles").update({ locality_id: foreignLocality.id }).eq("id", mikaId);
      assert.ok(invalidLocationError, "cross-country locality write bypassed the normalized hierarchy");
    }
    const { error: mismatchedCountryError } = await mika.from("profiles").update({ country: "Spain" }).eq("id", mikaId);
    assert.ok(mismatchedCountryError, "legacy country text write bypassed normalized country consistency");
    if (mikaProfile.location_precision === "locality" && (mikaProfile.region_code || mikaProfile.locality_id)) {
      const { error: precisionError } = await mika.from("profiles").update({ location_precision: "country" }).eq("id", mikaId);
      assert.ok(precisionError, "country precision write retained incompatible child location fields");
    }
  }

  // Friendship destinations are owned through the profile-save RPC. Direct
  // table DML must not bypass the duplicate or configured-limit validation,
  // while the public projection exposes only canonical country/region names.
  const [{ data: mikaLanguages, error: mikaLanguagesError }, { data: mikaInterests, error: mikaInterestsError }, { data: originalDestinations, error: originalDestinationsError }] = await Promise.all([
    mika.from("profile_languages").select("language_id,proficiency,purpose").eq("profile_id", mikaId),
    mika.from("profile_interests").select("interest_id").eq("profile_id", mikaId),
    mika.from("profile_friendship_destinations").select("country_code,region_code").eq("profile_id", mikaId).order("created_at", { ascending: true }),
  ]);
  assertNoError(mikaLanguagesError, "read own profile languages for destination flow");
  assertNoError(mikaInterestsError, "read own profile interests for destination flow");
  assertNoError(originalDestinationsError, "read own destinations");
  const profileSave = (destinations) => mika.rpc("save_profile", {
    p_username: mikaProfile.username,
    p_display_name: mikaProfile.display_name,
    p_birth_date: mikaProfile.birth_date,
    p_gender: mikaProfile.gender,
    p_country: mikaProfile.country,
    p_city: mikaProfile.city,
    p_bio: mikaProfile.bio,
    p_quote: mikaProfile.quote,
    p_looking_for: mikaProfile.looking_for,
    p_languages: mikaLanguages ?? [],
    p_interests: (mikaInterests ?? []).map((row) => row.interest_id),
    p_country_code: mikaProfile.country_code,
    p_region_code: mikaProfile.region_code,
    p_locality_id: mikaProfile.locality_id,
    p_location_precision: mikaProfile.location_precision,
    p_friendship_destinations: destinations,
  });
  try {
    const { data: configuredDestinationLimit, error: configuredDestinationLimitError } = await mika.rpc("get_friendship_destination_limit");
    assertNoError(configuredDestinationLimitError, "read destination limit");
    assert.equal(configuredDestinationLimit, 5, "destination limit should use the current local configuration");
    const { data: firstDestinationSave, error: firstDestinationError } = await profileSave([{ country_code: "PT" }]);
    assertNoError(firstDestinationError, "save first friendship destination");
    assert.equal(firstDestinationSave, "ok");
    const { data: savedDestinations, error: savedDestinationsError } = await mika.from("profile_friendship_destinations").select("country_code,region_code").eq("profile_id", mikaId);
    assertNoError(savedDestinationsError, "read saved friendship destination");
    assert.deepEqual(savedDestinations, [{ country_code: "PT", region_code: null }]);
    const { error: duplicateDestinationError } = await profileSave([{ country_code: "PT" }, { country_code: "pt" }]);
    assert.ok(duplicateDestinationError, "duplicate friendship destination was accepted");
    assert.match(duplicateDestinationError.message, /Duplicate friendship destination/i);
    const { error: overLimitDestinationError } = await profileSave(["PT", "JP", "KR", "CA", "NG", "IT"].map((country_code) => ({ country_code })));
    assert.ok(overLimitDestinationError, "friendship destination limit was bypassed");
    assert.match(overLimitDestinationError.message, /Too many friendship destinations/i);
    const { error: directDestinationWriteError } = await mika.from("profile_friendship_destinations").insert({ profile_id: mikaId, country_code: "JP" });
    assert.ok(directDestinationWriteError, "direct destination table write bypassed the protected save RPC");
    const { data: regionalDestinationSave, error: regionalDestinationError } = await profileSave([{ country_code: "PT", region_code: "PT-11" }]);
    assertNoError(regionalDestinationError, "save regional friendship destination");
    assert.equal(regionalDestinationSave, "ok");
    const { data: publicDestinations, error: publicDestinationsError } = await yuna.rpc("get_public_friendship_destinations", { target_user: mikaId });
    assertNoError(publicDestinationsError, "read public friendship destinations");
    assert.deepEqual(publicDestinations, [{ country_code: "PT", country_name: "Portugal", region_code: "PT-11", region_name: "Lisbon" }]);
    const { error: removeDestinationsError } = await profileSave([]);
    assertNoError(removeDestinationsError, "remove friendship destinations");
    const { data: removedDestinations, error: removedDestinationsError } = await mika.from("profile_friendship_destinations").select("country_code,region_code").eq("profile_id", mikaId);
    assertNoError(removedDestinationsError, "verify removed friendship destinations");
    assert.deepEqual(removedDestinations, []);
  } finally {
    const { error: restoreDestinationsError } = await profileSave(originalDestinations ?? []);
    assertNoError(restoreDestinationsError, "restore friendship destinations");
  }

  const { data: exclusions, error: exclusionsError } = await mika.from("profile_introduction_country_exclusions").select("country_code").eq("profile_id", mikaId);
  assertNoError(exclusionsError, "read own exclusions");
  const countryCodes = (exclusions || []).map((row) => row.country_code);

  // Direct profile reads remain private to the owner; public identity is served by the guarded RPC.
  const { data: directOtherProfile, error: directProfileError } = await yuna.from("profiles").select("id").eq("id", mikaId).maybeSingle();
  assertNoError(directProfileError, "cross-user profile read");
  assert.equal(directOtherProfile, null, "RLS leaked another user's profile row");
  const { data: visibleProfile, error: visibleProfileError } = await yuna.rpc("get_public_profile", { target_username: "mika" });
  assertNoError(visibleProfileError, "public profile RPC baseline");
  assert.ok(visibleProfile, "eligible seeded profile was not visible before privacy changes");

  let blockCreated = false;
  let pauseChanged = false;
  let deactivationChanged = false;
  let storagePath = null;
  try {
    const { error: blockError } = await mika.from("profile_blocks").insert({ blocker_id: mikaId, blocked_id: yunaId });
    assertNoError(blockError, "create temporary block");
    blockCreated = true;
    const { data: blockedProfile, error: blockedProfileError } = await yuna.rpc("get_public_profile", { target_username: "mika" });
    assertNoError(blockedProfileError, "blocked public profile RPC");
    assert.equal(blockedProfile, null, "blocked profile remained visible");
    const { data: blockedDiscover, error: blockedDiscoverError } = await yuna.rpc("get_discover_profiles");
    assertNoError(blockedDiscoverError, "blocked discover RPC");
    assert.ok(!(blockedDiscover || []).some((row) => row.id === mikaId), "blocked profile remained in Discover");
    const { error: unblockError } = await mika.from("profile_blocks").delete().eq("blocker_id", mikaId).eq("blocked_id", yunaId);
    assertNoError(unblockError, "remove temporary block");
    blockCreated = false;
    const { data: restoredProfile, error: restoredProfileError } = await yuna.rpc("get_public_profile", { target_username: "mika" });
    assertNoError(restoredProfileError, "unblocked public profile RPC");
    assert.ok(restoredProfile, "unblocked profile did not become visible again");

    await savePrivacy(mika, mikaProfile, countryCodes, true);
    pauseChanged = true;
    const { data: pausedProfile, error: pausedProfileError } = await yuna.rpc("get_public_profile", { target_username: "mika" });
    assertNoError(pausedProfileError, "paused public profile RPC");
    assert.ok(pausedProfile, "paused profile identity unexpectedly disappeared");
    assert.equal(pausedProfile.activity_status, null, "paused profile advertised activity");
    assert.equal(pausedProfile.availability, null, "paused profile advertised availability");
    const { data: pausedDiscover, error: pausedDiscoverError } = await yuna.rpc("get_discover_profiles");
    assertNoError(pausedDiscoverError, "paused discover RPC");
    assert.ok(!(pausedDiscover || []).some((row) => row.id === mikaId), "paused profile remained in Discover");
    const { error: pausedContactError } = await yuna.rpc("submit_introduction", {
      other_user: mikaId,
      introduction: "I would love to exchange thoughtful stories about our cities and the small details that make daily life interesting.",
    });
    assert.ok(pausedContactError, "paused profile accepted a new introduction");
    await savePrivacy(mika, mikaProfile, countryCodes, false);
    pauseChanged = false;

    const { error: deactivateError } = await mika.rpc("deactivate_account");
    assertNoError(deactivateError, "deactivate account");
    deactivationChanged = true;
    const { data: deactivatedProfile, error: deactivatedProfileError } = await yuna.rpc("get_public_profile", { target_username: "mika" });
    assertNoError(deactivatedProfileError, "deactivated public profile RPC");
    assert.equal(deactivatedProfile, null, "deactivated profile remained publicly visible");
    const { data: deactivatedDiscover, error: deactivatedDiscoverError } = await yuna.rpc("get_discover_profiles");
    assertNoError(deactivatedDiscoverError, "deactivated discover RPC");
    assert.ok(!(deactivatedDiscover || []).some((row) => row.id === mikaId), "deactivated profile remained in Discover");
    const { error: reactivateError } = await mika.rpc("reactivate_account");
    assertNoError(reactivateError, "reactivate account");
    deactivationChanged = false;

    // Upload a temporary object through the real Storage API. The owner can read it,
    // an unrelated authenticated user cannot, and the public endpoint is not usable.
    storagePath = `${sofiaId}/qa-integration-${crypto.randomUUID()}.png`;
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const { error: uploadError } = await sofia.storage.from("avatars").upload(storagePath, new Blob([bytes], { type: "image/png" }), { contentType: "image/png", upsert: false });
    assertNoError(uploadError, "owner avatar upload");
    const { data: ownerPhoto, error: ownerPhotoError } = await sofia.storage.from("avatars").download(storagePath);
    assertNoError(ownerPhotoError, "owner avatar download");
    assert.ok(ownerPhoto, "owner could not read uploaded avatar");
    const { data: unrelatedPhoto, error: unrelatedPhotoError } = await yuna.storage.from("avatars").download(storagePath);
    assert.ok(unrelatedPhotoError || !unrelatedPhoto, "unrelated user read a private avatar");
    const { data: publicObject } = sofia.storage.from("avatars").getPublicUrl(storagePath);
    const publicResponse = await fetch(publicObject.publicUrl, { signal: AbortSignal.timeout(5000) });
    assert.equal(publicResponse.ok, false, "private avatar was accessible through a public URL");

    // Ordinary authenticated users cannot invoke privileged moderation review RPCs.
    const { error: reviewError } = await yuna.rpc("admin_get_conversation_review", {
      conversation_uuid: crypto.randomUUID(),
      target_user_id: null,
      report_uuid: null,
      access_reason: "integration authorization check",
    });
    assert.ok(reviewError, "ordinary user invoked privileged conversation review");
    assert.match(reviewError.message, /Moderator authorization required/i);
    const { error: listError } = await yuna.rpc("admin_list_user_conversations", { target_user_id: mikaId, access_reason: "integration authorization check" });
    assert.ok(listError, "ordinary user invoked privileged conversation listing");
    assert.match(listError.message, /Administrator authorization required/i);
  } finally {
    if (storagePath) {
      await sofia.storage.from("avatars").remove([storagePath]);
    }
    if (deactivationChanged) {
      await mika.rpc("reactivate_account");
    }
    if (pauseChanged) {
      await savePrivacy(mika, mikaProfile, countryCodes, false);
    }
    if (blockCreated) {
      await mika.from("profile_blocks").delete().eq("blocker_id", mikaId).eq("blocked_id", yunaId);
    }
    await mika.auth.signOut();
    await yuna.auth.signOut();
    await sofia.auth.signOut();
  }
});
