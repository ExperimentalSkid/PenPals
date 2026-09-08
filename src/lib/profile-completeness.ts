export type ProfileCompletenessFields = {
  username?: string | null;
  display_name?: string | null;
  birth_date?: string | null;
  gender?: string | null;
  country?: string | null;
  city?: string | null;
  region_code?: string | null;
  location_precision?: string | null;
  bio?: string | null;
  quote?: string | null;
  looking_for?: string | null;
  avatar_path?: string | null;
};

export type ProfileCompletionProgress = {
  basicsComplete: boolean;
  languagesComplete: boolean;
  interestsComplete: boolean;
  preferencesComplete: boolean;
  photoComplete: boolean;
  entryComplete: boolean;
  percent: number;
  complete: boolean;
};

export type OnboardingStep = "basics" | "languages" | "interests";

/**
 * The minimum structured profile needed before a member can enter the app.
 * Keep this predicate small and shared by the request boundary, OAuth
 * callback, setup UI, and profile-save action. Richer profile details remain
 * available as optional edits after entry.
 */
export function onboardingEntryComplete(
  profile: ProfileCompletenessFields,
  languageCount: number,
  interestCount: number,
) {
  return Boolean(
    profile.username?.trim()
      && profile.display_name?.trim()
      && profile.birth_date
      && profile.country?.trim()
      && languageCount > 0
      && interestCount >= 3,
  );
}

export function onboardingNextStep(
  profile: ProfileCompletenessFields,
  languageCount: number,
  interestCount: number,
): OnboardingStep | null {
  if (!profile.username?.trim() || !profile.display_name?.trim() || !profile.birth_date || !profile.country?.trim()) return "basics";
  if (languageCount < 1) return "languages";
  if (interestCount < 3) return "interests";
  return null;
}

export function profileCompletionProgress(
  profile: ProfileCompletenessFields,
  languageCount: number,
  interestCount: number,
): ProfileCompletionProgress {
  const effectiveLocationPrecision = profile.location_precision ?? (profile.region_code ? "region" : profile.city?.trim() ? "locality" : "country");
  const locationComplete = effectiveLocationPrecision === "country"
    ? Boolean(profile.country?.trim())
    : effectiveLocationPrecision === "region"
      ? Boolean(profile.country?.trim() && profile.region_code?.trim())
      : Boolean(profile.country?.trim() && profile.city?.trim());
  const basicsComplete = Boolean(profile.username?.trim() && profile.display_name?.trim() && profile.birth_date && locationComplete);
  const languagesComplete = languageCount > 0;
  const interestsComplete = interestCount >= 3;
  // `looking_for` is a legacy field that is no longer part of the profile
  // experience. It must not keep an otherwise complete profile from reaching
  // 100% completion. The current story fields are bio and quote.
  const preferencesComplete = Boolean(profile.bio?.trim() && profile.quote?.trim());
  const photoComplete = Boolean(profile.avatar_path?.trim());
  const entryComplete = onboardingEntryComplete(profile, languageCount, interestCount);
  const required = [
    Boolean(profile.username?.trim()),
    Boolean(profile.display_name?.trim()),
    Boolean(profile.birth_date),
    Boolean(profile.gender?.trim()),
    locationComplete,
    Boolean(profile.bio?.trim()),
    Boolean(profile.quote?.trim()),
    languagesComplete,
    interestsComplete,
    photoComplete,
  ];
  const percent = Math.round(required.filter(Boolean).length / required.length * 100);
  return { basicsComplete, languagesComplete, interestsComplete, preferencesComplete, photoComplete, entryComplete, percent, complete: required.every(Boolean) };
}

/**
 * A profile row alone is not enough to enter the normal app. Keep this
 * server-side completion rule shared by OAuth callbacks and the app boundary.
 */
export function hasCompletedProfile(
  profile: ProfileCompletenessFields,
  languageCount: number,
  interestCount: number,
) {
  return onboardingEntryComplete(profile, languageCount, interestCount);
}
