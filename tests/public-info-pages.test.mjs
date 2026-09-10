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
