import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [signIn, signUp, googleButton, authSubmitButton, discover, users, setup, destinations, messages, caseDetail] = await Promise.all([
  read("src/app/sign-in/page.tsx"),
  read("src/app/sign-up/page.tsx"),
  read("src/app/auth/GoogleAuthButton.tsx"),
  read("src/app/auth/AuthSubmitButton.tsx"),
  read("src/app/app/discover/page.tsx"),
  read("src/app/app/admin/users/page.tsx"),
  read("src/app/app/profile/setup/page.tsx"),
  read("src/app/app/profile/[username]/FriendshipDestinationsSection.tsx"),
  read("src/app/app/messages/page.tsx"),
  read("src/app/app/admin/cases/[id]/page.tsx"),
]);

test("auth entry pages share the Penpal visual language", () => {
  for (const page of [signIn, signUp]) {
    assert.match(page, /bg-\[#f7f5ef\]/);
    assert.match(page, /font-serif/);
    assert.match(page, /className="field/);
  }
  assert.match(signUp, /btn-primary/);
  assert.match(authSubmitButton, /btn-primary/);
  assert.match(googleButton, /btn-secondary/);
});

test("Discover distinguishes a failed load from a valid empty result", () => {
  assert.match(discover, /error: discoveryError/);
  assert.match(discover, /role="alert"/);
  assert.match(discover, /couldn&apos;t load Discover/);
  assert.match(discover, /Try again/);
  assert.equal((discover.match(/Browse member profiles from around the world\./g) ?? []).length, 1, "Discover subtitle should render once");
});

test("admin Users keeps the complete staff navigation visible", () => {
  assert.match(users, /<AdminHeader isAdmin active="users"/);
});

test("profile setup section navigation and public destination naming are consistent", () => {
  assert.match(setup, /aria-label="Profile setup sections"/);
  assert.match(setup, /href: "#basics"/);
  assert.match(setup, /href: "#languages"/);
  assert.match(setup, /href: "#interests"/);
  assert.match(setup, /href: "#preferences"/);
  assert.match(setup, /id="about-heading"/);
  assert.doesNotMatch(setup, /id="looking-heading"|name="looking_for"/);
  assert.match(destinations, /Places they&apos;d like to connect with/);
});

test("messages does not present a non-interactive all-conversations affordance", () => {
  assert.doesNotMatch(messages, /<p[^>]*>View all conversations/);
});

test("moderation case headings use human-readable target labels", () => {
  assert.match(caseDetail, /function titleFor/);
  assert.match(caseDetail, /title=\{titleFor\(item\.primary_target_type\)\}/);
});
