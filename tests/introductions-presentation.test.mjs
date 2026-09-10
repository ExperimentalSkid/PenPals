import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../src/app/app/introductions/page.tsx", import.meta.url), "utf8");
const sort = await readFile(new URL("../src/app/app/introductions/IntroductionSort.tsx", import.meta.url), "utf8");

test("Introductions presents the editorial inbox hierarchy and explanation strip", () => {
  assert.match(page, /app\.introductions\.eyebrow/);
  assert.match(page, /app\.introductions\.intro/);
  for (const key of ["wroteFirst", "pace", "start", "control"]) assert.match(page, new RegExp(`app\\.introductions\\.${key}`));
});

test("Introduction filters and sorting use real rows and preserve query state", () => {
  assert.match(page, /app\.introductions\.all[\s\S]*allRows\.length/);
  assert.match(page, /app\.introductions\.pending[\s\S]*pendingCount/);
  assert.match(page, /app\.introductions\.replied[\s\S]*repliedCount/);
  assert.match(sort, /app\.introductions\.newestFirst/);
  assert.match(sort, /app\.introductions\.oldestFirst/);
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
  assert.match(page, /app\.introductions\.open/);
  assert.match(page, /app\.introductions\.openConversation/);
  assert.match(page, /app\.introductions\.notInterested/);
  assert.match(page, /app\.introductions\.report/);
  assert.match(page, /replyToIntroduction/);
  assert.match(page, /declineIntroduction/);
  assert.match(page, /submitReport/);
});

test("Introduction empty states and responsive card structure are present", () => {
  assert.match(page, /app\.introductions\.emptyPending/);
  assert.match(page, /app\.introductions\.emptyReplied/);
  assert.match(page, /app\.introductions\.empty/);
  assert.match(page, /lg:grid-cols-\[minmax\(0,1fr\)_300px\]/);
  assert.match(page, /sm:flex-row/);
});

test("Introductions surfaces primary inbox read failures instead of a false empty state", () => {
  assert.match(page, /error: introductionsError/);
  assert.match(page, /app\.introductions\.loadError/);
  assert.match(page, /!introductionsError && !visibleRows\.length/);
});
