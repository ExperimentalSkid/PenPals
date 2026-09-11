import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const templateRoot = new URL("../supabase/templates/production/", import.meta.url);
const contracts = [
  { name: "confirmation", variables: ["SiteURL", "TokenHash"], type: "signup", heading: "Confirm your email" },
  { name: "recovery", variables: ["SiteURL", "TokenHash"], type: "recovery", heading: "Reset your password" },
  { name: "invite", variables: ["ConfirmationURL", "SiteURL"], providerType: "invite", heading: "You're invited" },
  { name: "magic-link", variables: ["ConfirmationURL", "SiteURL"], providerType: "magiclink", heading: "Sign in to Pen-Pals" },
  { name: "email-change", variables: ["ConfirmationURL", "NewEmail", "SiteURL"], providerType: "email_change", heading: "Confirm your email change" },
  { name: "reauthentication", variables: ["Token", "SiteURL"], heading: "Your verification code" },
];
const templates = new Map(await Promise.all(contracts.map(async ({ name }) => [
  name, await readFile(new URL(`${name}.html`, templateRoot), "utf8"),
])));

function links(html) {
  return Array.from(html.matchAll(/<a\b[^>]*\bhref="([^"]*)"[^>]*>/gi), ([, href]) => href);
}

function images(html) {
  return Array.from(html.matchAll(/<img\b[^>]*\bsrc="([^"]*)"[^>]*>/gi), ([, src]) => src);
}

function renderLink(href, values) {
  return href.replace(/{{\s*\.(\w+)\s*}}/g, (_, variable) => {
    assert.ok(Object.hasOwn(values, variable), `Unexpected variable ${variable}`);
    return values[variable];
  }).replaceAll("&amp;", "&");
}

for (const { name, variables, type, providerType, heading } of contracts) {
  test(`${name} template contains its supported variables and transactional content`, () => {
    const html = templates.get(name);
    const actualVariables = [...new Set(Array.from(html.matchAll(/{{\s*\.(\w+)\s*}}/g), ([, variable]) => variable))].sort();
    assert.deepEqual(actualVariables, [...variables].sort());
    assert.match(html, /<!doctype html>/i);
    assert.match(html, /<html lang="en">/);
    assert.match(html, /Pen-Pals/);
    assert.ok(html.includes(`>${heading}</h1>`), "The email must clearly name its action");
    assert.match(html, /If you (?:didn't|weren't)/);
    assert.doesNotMatch(html, /localhost|127\.0\.0\.1|https?:\/\//i);
    assert.doesNotMatch(html, /<(?:script|iframe|form|link)\b|\bsrcset=|@import|url\(/i);
    assert.deepEqual(images(html), ["{{ .SiteURL }}/assets/brand/logo/logo-primary.png"]);
    assert.match(html, /#073A73/);
    assert.match(html, /#60A4E1/);
    assert.equal(links(html).length, name === "reauthentication" ? 0 : 1);
  });

  if (type) {
    test(`${name} link delivers its token and exact type to the existing confirmation page`, () => {
      const [href] = links(templates.get(name));
      const site = "https://pen-pal-test.example";
      const token = "test-token-hash";
      const url = new URL(renderLink(href, { SiteURL: site, TokenHash: token }));
      assert.equal(url.origin, site);
      assert.equal(url.pathname, "/auth/confirm");
      assert.deepEqual([...url.searchParams], [["token_hash", token], ["type", type]]);
      assert.equal(url.hash, "");
    });
  } else if (name !== "reauthentication") {
    test(`${name} link preserves Supabase's complete lifecycle URL`, () => {
      const [href] = links(templates.get(name));
      const confirmationUrl = `https://project-ref.supabase.co/auth/v1/verify?token=test-token&type=${providerType}&redirect_to=https%3A%2F%2Fpen-pal-test.example%2Fauth%2Fconfirm`;
      assert.equal(href, "{{ .ConfirmationURL }}");
      assert.equal(renderLink(href, { ConfirmationURL: confirmationUrl }), confirmationUrl);
    });
  } else {
    test("reauthentication displays the one-time code without constructing a link", () => {
      const html = templates.get(name);
      assert.match(html, /<p\b[^>]*>\s*{{\s*\.Token\s*}}\s*<\/p>/);
      assert.doesNotMatch(html, /\bhref\s*=|TokenHash|ConfirmationURL/);
    });
  }
}
