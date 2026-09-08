import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../src/app/app/introductions/page.tsx", import.meta.url), "utf8");
const sort = await readFile(new URL("../src/app/app/introductions/IntroductionSort.tsx", import.meta.url), "utf8");

test("Introductions presents the editorial inbox hierarchy and explanation strip", () => {
  assert.match(page, /Your inbox/);
  assert.match(page, /Thoughtful first notes, kept separate from your conversations/);
  for (const label of ["They wrote first", "Read at your pace", "Start a conversation", "You're in control"]) {
    assert.match(page, new RegExp(label.replace("'", "&apos;")));
  }
});

test("Introduction filters and sorting use real rows and preserve query state", () => {
  assert.match(page, /All \(\{allRows\.length\}\)/);
  assert.match(page, /Pending \(\{pendingCount\}\)/);
  assert.match(page, /Replied \(\{repliedCount\}\)/);
  assert.match(sort, /Newest first/);
  assert.match(sort, /Oldest first/);
  assert.match(sort, /requestSubmit/);
  assert.match(page, /filterHref\(\"pending\"\)/);
  assert.match(page, /filterHref\(\"replied\"\)/);
});

test("Introduction cards retain authorized identity, location, photo and lifecycle actions", () => {
  assert.match(page, /resolve_profile_identity/);
  assert.match(page, /get_public_profile/);
  assert.match(page, /isPrivateAvatarPath/);
  assert.match(page, /createSignedUrl/);
  assert.match(page, /<CountryFlag code=\{person\.country_code\}/);
  assert.match(page, /Open introduction/);
  assert.match(page, /Open conversation/);
  assert.match(page, /Not interested/);
  assert.match(page, /Report introduction/);
  assert.match(page, /replyToIntroduction/);
  assert.match(page, /declineIntroduction/);
  assert.match(page, /submitReport/);
});

test("Introduction empty states and responsive card structure are present", () => {
  assert.match(page, /No pending introductions right now/);
  assert.match(page, /No replied introductions yet/);
  assert.match(page, /No introductions yet/);
  assert.match(page, /lg:grid-cols-\[minmax\(0,1fr\)_300px\]/);
  assert.match(page, /sm:flex-row/);
});
