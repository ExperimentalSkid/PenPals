import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("transactional app emails use the locked Pen-Pals brand shell", async () => {
  const shared = await read("src/lib/email/brand-template.ts");
  const contact = await read("src/lib/contact-verification.ts");
  const support = await read("src/lib/email/resend.ts");
  const snail = await read("scripts/notification-email-templates.mjs");
  for (const source of [shared, snail]) {
    assert.match(source, /logo-primary\.png/);
    assert.match(source, /#073A73/);
    assert.match(source, /#60A4E1/);
    assert.match(source, /#f7f5ef/i);
  }
  assert.match(contact, /brandedEmailHtml/);
  assert.match(support, /brandedEmailHtml/);
  assert.match(snail, /Your Snail Mail has arrived/);
});

test("branding does not alter the sensitive transactional payloads", async () => {
  const contact = await read("src/lib/contact-verification.ts");
  const support = await read("src/lib/email/resend.ts");
  assert.match(contact, /verificationUrl/);
  assert.match(contact, /expires in 1 hour/);
  assert.match(support, /Reference: \${ticketCode}/);
  assert.match(support, /emailParagraphs\(body\)/);
});
