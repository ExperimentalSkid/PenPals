import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("public Contact form discloses anti-abuse metadata collection at collection time", async () => {
  const page = await read("src/app/contact/page.tsx");
  const en = JSON.parse(await read("src/i18n/messages/en.json"));
  const es = JSON.parse(await read("src/i18n/messages/es.json"));
  assert.match(page, /contact\.privacyNotice/);
  assert.match(page, /localizedPublicPath\("\/privacy"/);
  for (const value of [en.contact.privacyNotice, es.contact.privacyNotice]) {
    assert.match(value, /IP|dirección IP/i);
    assert.match(value, /timezone|zona horaria/i);
    assert.match(value, /identity|identidad/i);
  }
});

test("Privacy page documents Contact security, investigation, and retention processing", async () => {
  const page = await read("src/app/privacy/page.tsx");
  const en = JSON.parse(await read("src/i18n/messages/en.json"));
  const es = JSON.parse(await read("src/i18n/messages/es.json"));
  for (const key of ["contactDataTitle", "contactDataBody", "contactPurposeTitle", "contactPurposeBody", "contactRetentionTitle", "contactRetentionBody"]) assert.match(page, new RegExp(`privacy\\.${key}`));
  assert.match(en.privacy.contactDataBody, /IP address/);
  assert.match(en.privacy.contactPurposeBody, /legitimate interests/);
  assert.match(en.privacy.contactPurposeBody, /evidence access or export/);
  assert.match(en.privacy.contactRetentionBody, /one hour/);
  assert.match(en.privacy.contactRetentionBody, /retention rules configured by administrators/);
  assert.match(es.privacy.contactPurposeBody, /intereses legítimos/);
  assert.match(es.privacy.contactRetentionBody, /reglas de conservación configuradas por los administradores/);
});
