import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const languages = await readFile(new URL("src/app/app/profile/[username]/LanguagesSection.tsx", root), "utf8");
const compatibility = await readFile(new URL("src/lib/language-compatibility.ts", root), "utf8");
const profileView = await readFile(new URL("src/app/app/profile/[username]/ProfileView.tsx", root), "utf8");

test("public Languages module maps stored values to human-readable proficiency", () => {
  for (const label of ["Native", "Fluent", "Conversational", "Learning"]) assert.match(compatibility, new RegExp(`\\"${label}\\"`));
  assert.match(languages, /formatLanguageProficiency/);
  assert.match(languages, /purpose === "learning"/);
  assert.match(languages, /LanguageFlag/);
  assert.match(languages, /if \(languages\.length === 0\) return null/);
});

test("ProfileView keeps Languages as one independent public module", () => {
  assert.match(profileView, /import LanguagesSection, \{ type ProfileLanguage \} from "\.\/LanguagesSection"/);
  assert.match(profileView, /<LanguagesSection languages=\{languages\} \/>/);
  assert.doesNotMatch(profileView, /languages\.map\(\(language\)/);
});
