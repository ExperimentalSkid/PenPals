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
    assert.match(page, /className="page-title"/);
    assert.match(page, /className="field/);
  }
  assert.match(signUp, /btn-primary/);
  assert.match(authSubmitButton, /btn-primary/);
  assert.match(googleButton, /btn-secondary/);
});

test("Discover distinguishes a failed load from a valid empty result", () => {
  assert.match(discover, /error: discoveryError/);
  assert.match(discover, /role="alert"/);
  assert.match(discover, /app\.discover\.loadError/);
  assert.match(discover, /app\.discover\.tryAgain/);
  assert.equal((discover.match(/t\("app\.discover\.intro"\)/g) ?? []).length, 1, "Discover subtitle should render once");
});

test("admin Users keeps the complete staff navigation visible", () => {
  assert.match(users, /<AdminHeader isAdmin active="users"/);
});

test("profile setup section navigation and public destination naming are consistent", () => {
  assert.match(setup, /aria-label=\{t\("app\.profile\.profileSections"\)\}/);
  assert.match(setup, /href: "#basics"/);
  assert.match(setup, /href: "#languages"/);
  assert.match(setup, /href: "#interests"/);
  assert.match(setup, /href: "#preferences"/);
  assert.match(setup, /id="about-heading"/);
  assert.doesNotMatch(setup, /id="looking-heading"|name="looking_for"/);
  assert.match(destinations, /app\.profile\.destinationsTitle/);
});

test("messages does not present a non-interactive all-conversations affordance", () => {
  assert.doesNotMatch(messages, /<p[^>]*>View all conversations/);
});

test("moderation case headings use human-readable target labels", () => {
  assert.match(caseDetail, /function titleFor/);
  assert.match(caseDetail, /title=\{titleFor\(item\.primary_target_type\)\}/);
});

test("above-the-fold app wordmarks load eagerly without changing logo dimensions", async () => {
  const layout = await read("src/app/app/layout.tsx");
  const logo = await read("src/app/components/BrandLogo.tsx");
  assert.equal((layout.match(/<BrandLogo variant="wordmark" loading="eager"/g) ?? []).length, 2);
  assert.match(logo, /loading=\{loading\}/);
  assert.match(logo, /width=\{asset\.width\} height=\{asset\.height\}/);
});


test("public profile backend failures do not masquerade as 404s", async () => {
  const page = await readFile(new URL("../src/app/app/profile/[username]/page.tsx", import.meta.url), "utf8");
  assert.match(page, /data: profile, error: profileError/);
  assert.match(page, /if \(profileError\) throw profileError/);
  assert.match(page, /data: identityData, error: identityError/);
  assert.match(page, /if \(identityError\) throw identityError/);
  assert.match(page, /if \(!profile\) notFound\(\)/);
  assert.match(page, /if \(!identity\) notFound\(\)/);
});
