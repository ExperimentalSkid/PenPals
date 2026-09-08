export type LanguagePurpose = "speaks" | "learning";

export type LanguageCompatibilityEntry = {
  language_id: number;
  name: string;
  proficiency?: string | null;
  purpose?: string | null;
};

export type LanguageRelation = { name?: string | null };

export function languageNameFromRelation(value: LanguageRelation | LanguageRelation[] | null | undefined) {
  const name = Array.isArray(value) ? value[0]?.name : value?.name;
  return name?.trim() || "Language";
}

export type LanguageCompatibility = {
  /** Languages both people have marked as languages they speak. */
  sharedLanguages: string[];
  /** Languages one person speaks while the other has marked them as learning. */
  exchangeLanguages: string[];
};

/**
 * Keep the public labels for stored proficiency values in one place. A
 * learning purpose describes intent, so it is displayed as Learning even if a
 * legacy row contains a different proficiency value.
 */
export function formatLanguageProficiency(proficiency?: string | null, purpose?: string | null) {
  if (purpose === "learning") return "Learning";
  if (proficiency === "native") return "Native";
  if (proficiency === "fluent") return "Fluent";
  if (proficiency === "intermediate") return "Conversational";
  if (proficiency === "beginner") return "Learning";
  return null;
}

function purposeOf(value: string | null | undefined): LanguagePurpose | null {
  return value === "speaks" || value === "learning" ? value : null;
}

/**
 * Derive compatibility from each person's stored language purpose. This is
 * intentionally viewer-relative: only the viewer's own rows and the target's
 * rows are compared, and no compatibility data is added to Discover.
 */
export function deriveLanguageCompatibility(
  viewerLanguages: LanguageCompatibilityEntry[],
  targetLanguages: LanguageCompatibilityEntry[],
): LanguageCompatibility {
  const viewerSpeaks = new Set<number>();
  const viewerLearning = new Set<number>();
  const targetSpeaks = new Set<number>();
  const targetLearning = new Set<number>();
  const names = new Map<number, string>();

  for (const entry of [...targetLanguages, ...viewerLanguages]) {
    const name = entry.name.trim();
    if (name && !names.has(entry.language_id)) names.set(entry.language_id, name);
  }

  for (const entry of viewerLanguages) {
    const purpose = purposeOf(entry.purpose);
    if (purpose === "speaks") viewerSpeaks.add(entry.language_id);
    if (purpose === "learning") viewerLearning.add(entry.language_id);
  }
  for (const entry of targetLanguages) {
    const purpose = purposeOf(entry.purpose);
    if (purpose === "speaks") targetSpeaks.add(entry.language_id);
    if (purpose === "learning") targetLearning.add(entry.language_id);
  }

  const sharedIds = [...targetSpeaks].filter((id) => viewerSpeaks.has(id));
  const exchangeIds = [...new Set([
    ...[...targetLearning].filter((id) => viewerSpeaks.has(id)),
    ...[...targetSpeaks].filter((id) => viewerLearning.has(id)),
  ])].filter((id) => !sharedIds.includes(id));

  return {
    sharedLanguages: sharedIds.map((id) => names.get(id)).filter((name): name is string => Boolean(name)),
    exchangeLanguages: exchangeIds.map((id) => names.get(id)).filter((name): name is string => Boolean(name)),
  };
}
