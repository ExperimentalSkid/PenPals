import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const helper = await read("src/lib/language-compatibility.ts");
const profilePage = await read("src/app/app/profile/[username]/page.tsx");
const profileView = await read("src/app/app/profile/[username]/ProfileView.tsx");
const languagesSection = await read("src/app/app/profile/[username]/LanguagesSection.tsx");
const conversation = await read("src/app/app/messages/[id]/page.tsx");
const discover = await read("src/app/app/discover/page.tsx");

test("language compatibility is derived from stored purpose, not inferred from names", () => {
  assert.match(helper, /purposeOf/);
  assert.match(helper, /viewerSpeaks/);
  assert.match(helper, /viewerLearning/);
  assert.match(helper, /targetSpeaks/);
  assert.match(helper, /targetLearning/);
  assert.match(helper, /targetLearning.*viewerSpeaks/s);
  assert.match(helper, /targetSpeaks.*viewerLearning/s);
  assert.match(helper, /sharedLanguages/);
  assert.match(helper, /exchangeLanguages/);
  for (const label of ["Native", "Fluent", "Conversational", "Learning"]) assert.match(helper, new RegExp(`"${label}"`));
  assert.match(helper, /purpose === "learning"/);
});

test("public profile compares the target to the current viewer and keeps Discover minimal", () => {
  assert.match(profilePage, /profile_languages.*eq\("profile_id", auth\.claims\.sub\)/s);
  assert.match(profilePage, /deriveLanguageCompatibility/);
  assert.match(profilePage, /const languageCompatibility = isOwn\s*\n\s*\? null/);
  assert.match(profileView, /languageCompatibility\?: LanguageCompatibility/);
  assert.match(profileView, /app\.profile\.bothSpeak/);
  assert.match(profileView, /app\.profile\.languageExchange/);
  assert.doesNotMatch(discover, /deriveLanguageCompatibility|app\.profile\.bothSpeak|app\.profile\.languageExchange/);
});

test("conversation helper context uses both participants and preserves target proficiency labels", () => {
  assert.match(conversation, /profile_languages.*eq\("profile_id", targetId\)/s);
  assert.match(conversation, /profile_languages.*eq\("profile_id", uid\)/s);
  assert.match(conversation, /formatLanguageProficiency/);
  assert.match(conversation, /deriveLanguageCompatibility/);
  assert.match(conversation, /app\.messages\.bothSpeak/);
  assert.match(conversation, /app\.messages\.languageExchange/);
  assert.match(conversation, /key=\{`\$\{language\.languageId\}-\$\{language\.purpose/);
});

test("language module supports intent-aware levels and stable rows for duplicate purpose entries", () => {
  assert.match(languagesSection, /purpose === "learning"/);
  assert.match(languagesSection, /formatLanguageProficiency/);
  assert.match(languagesSection, /key=\{`\$\{language\.language_id\}-\$\{language\.purpose/);
});
