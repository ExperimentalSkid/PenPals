import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("public FAQ, privacy, and contact pages exist with canonical metadata", async () => {
  const faq = await read("src/app/faq/page.tsx");
  const privacy = await read("src/app/privacy/page.tsx");
  const contact = await read("src/app/contact/page.tsx");
  const gdpr = await read("src/app/gdpr/page.tsx");

  assert.match(faq, /t\("faq\.title"\)/);
  assert.match(faq, /t\("faq\.privacy"\)/);
  assert.match(privacy, /t\("privacy\.title"\)/);
  assert.match(privacy, /t\("privacy\.manageTitle"\)/);
  assert.match(contact, /t\("contact\.title"\)/);
  assert.match(contact, /submitPublicContact/);
  assert.match(gdpr, /permanentRedirect\("\/privacy"\)/);
  assert.match(faq, /localizedPublicMetadata\(locale, "\/faq"/);
  assert.match(privacy, /localizedPublicMetadata\(locale, "\/privacy"/);
  assert.match(contact, /localizedPublicMetadata\(locale, "\/contact"/);
  for (const source of [faq, privacy, contact]) assert.match(source, /PublicInfoPage/);
});

test("public pages are linked from the front page and generated sitemap", async () => {
  const home = await read("src/app/page.tsx");
  const footer = await read("src/app/components/PublicFooter.tsx");
  const sitemap = await read("src/app/sitemap.ts");

  assert.match(home, /PublicFooter/);
  for (const href of ["/faq", "/privacy", "/contact"]) {
    const escaped = href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(footer, new RegExp(`localizedPublicPath\\(\"${escaped}\", locale\\)`));
    assert.match(sitemap, new RegExp(`\"${escaped}\"`));
  }
});


test("FAQ serves the legacy mark locally instead of making a third-party image request", async () => {
  const faq = await read("src/app/faq/page.tsx");
  assert.match(faq, /\/assets\/legacy\/international-pen-friends-logo\.jpg/);
  assert.doesNotMatch(faq, /src=\"https:\/\/www\.ipf\.net\.au\/images\//);
});

test("homepage copy foregrounds friendship and delayed Snail Mail without dating-style CTA language", async () => {
  const home = await read("src/app/page.tsx");
  const en = JSON.parse(await read("src/i18n/messages/en.json"));
  const es = JSON.parse(await read("src/i18n/messages/es.json"));

  assert.match(home, /home\.snailMailIntro/);
  assert.equal(en.home.findPeople, "Find someone worth writing to");
  assert.match(en.home.snailMailIntro, /letters travel before they arrive/i);
  assert.doesNotMatch(en.home.findPeople, /find your people/i);
  assert.equal(es.home.findPeople, "Encuentra a alguien a quien escribir");
  assert.match(es.home.snailMailIntro, /cartas viajan antes de llegar/i);
  for (const value of [es.home.explore, es.home.countryLink, es.home.languageLink, es.home.interestLink, es.auth.signUp.description]) {
    assert.doesNotMatch(value, /pen pals/i);
  }
});
