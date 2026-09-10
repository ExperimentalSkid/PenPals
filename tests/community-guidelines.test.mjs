import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const [page, footer, proxy, sitemap, enText, esText] = await Promise.all([
  read("src/app/guidelines/page.tsx"),
  read("src/app/components/PublicFooter.tsx"),
  read("src/proxy.ts"),
  read("src/app/sitemap.ts"),
  read("src/i18n/messages/en.json"),
  read("src/i18n/messages/es.json"),
]);
const en = JSON.parse(enText);
const es = JSON.parse(esText);

test("Community Guidelines are public, localized, and linked", () => {
  assert.match(page, /localizedPublicMetadata\(locale, "\/guidelines"/);
  assert.match(page, /guidelines\.sections\.\$\{key\}Title/);
  assert.match(footer, /localizedPublicPath\("\/guidelines", locale\)/);
  assert.match(proxy, /"\/guidelines"/);
  assert.match(sitemap, /"\/guidelines"/);
});
test("Community Guidelines reflect enforced friendship and safety boundaries", () => {
  assert.match(en.guidelines.sections.friendshipBody, /(not|do not use it as) a dating service/i);
  assert.match(en.guidelines.sections.adultsBody, /at least 18 years old/i);
  assert.match(en.guidelines.sections.sexualBody, /unsolicited sexual/i);
  assert.match(en.guidelines.sections.spamBody, /three consecutive unanswered messages/i);
  assert.match(en.guidelines.sections.spamBody, /still travelling or remains unread/i);
  assert.match(en.guidelines.sections.reportingBody, /Block someone/i);
  assert.match(en.guidelines.sections.enforcementBody, /suspend|terminate/i);

  assert.match(es.guidelines.sections.friendshipBody, /No lo utilices como servicio de citas/i);
  assert.match(es.guidelines.sections.adultsBody, /al menos 18 años/i);
  assert.match(es.guidelines.sections.sexualBody, /mensajes sexuales no solicitados/i);
  assert.match(es.guidelines.sections.spamBody, /tres mensajes consecutivos sin respuesta/i);
});

test("guidelines catalogs retain English and Spanish key parity", () => {
  const keys = (value, prefix = "") => Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return child && typeof child === "object" && !Array.isArray(child) ? keys(child, path) : [path];
  }).sort();
  assert.deepEqual(keys(en.guidelines), keys(es.guidelines));
});
