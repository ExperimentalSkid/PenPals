import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const interests = await readFile(new URL("src/app/app/profile/[username]/InterestsSection.tsx", root), "utf8");
const profileView = await readFile(new URL("src/app/app/profile/[username]/ProfileView.tsx", root), "utf8");

test("public Interests module uses compact chips and hides when empty", () => {
  assert.match(interests, /flex flex-wrap gap-2/);
  assert.match(interests, /if \(interests\.length === 0\) return null/);
  assert.match(interests, /additionalInterests/);
  assert.match(interests, /\+\{additionalInterests\.length\} more/);
});

test("ProfileView keeps Interests as one independent public module", () => {
  assert.match(profileView, /import InterestsSection, \{ type ProfileInterest \} from "\.\/InterestsSection"/);
  assert.match(profileView, /<InterestsSection interests=\{interests\} \/>/);
  assert.doesNotMatch(profileView, /interests\.map\(\(interest\)/);
});
