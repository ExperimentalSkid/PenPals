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

  assert.match(faq, /Frequently asked questions/);
  assert.match(faq, /Privacy &amp; data rights/);
  assert.match(privacy, /Privacy & data rights/);
  assert.match(privacy, /Download, correct, or delete data/);
  assert.match(contact, /Contact pen-pals\.net/);
  assert.match(contact, /submitPublicContact/);
  assert.match(gdpr, /permanentRedirect\("\/privacy"\)/);
  for (const source of [faq, privacy, contact]) {
    assert.match(source, /alternates: \{ canonical:/);
    assert.match(source, /PublicInfoPage/);
  }
});

test("public pages are linked from the front page and generated sitemap", async () => {
  const home = await read("src/app/page.tsx");
  const footer = await read("src/app/components/PublicFooter.tsx");
  const sitemap = await read("src/app/sitemap.ts");

  assert.match(home, /PublicFooter/);
  for (const href of ["/faq", "/privacy", "/contact"]) {
    assert.match(footer, new RegExp(`href="${href}"`));
    assert.match(sitemap, new RegExp(`"${href}"`));
  }
});
