import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const about = await readFile(new URL("src/app/app/profile/[username]/AboutSection.tsx", root), "utf8");
const profileView = await readFile(new URL("src/app/app/profile/[username]/ProfileView.tsx", root), "utf8");

test("public About module preserves biography paragraphs and line breaks", () => {
  assert.match(about, /text\.split\(\/\\n\\s\*\\n\//);
  assert.match(about, /className=\"whitespace-pre-line\"/);
  assert.match(about, /if \(!text\) return null/);
});

test("ProfileView keeps About as an independent public module", () => {
  assert.match(profileView, /import AboutSection from \"\.\/AboutSection\"/);
  assert.match(profileView, /<AboutSection bio=\{profile\.bio\} \/>/);
  assert.doesNotMatch(profileView, /profile\.bio\.split/);
});
