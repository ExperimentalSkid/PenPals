import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("normal-user messaging and profile surfaces use translation keys for interactive copy", async () => {
  const [thread, inbox, snail, profile, sort] = await Promise.all([
    read("src/app/app/messages/[id]/ConversationThread.tsx"),
    read("src/app/app/messages/page.tsx"),
    read("src/app/app/messages/[id]/SnailMailPanel.tsx"),
    read("src/app/app/profile/[username]/page.tsx"),
    read("src/app/app/introductions/IntroductionSort.tsx"),
  ]);
  assert.doesNotMatch(thread, /Search this conversation…|No matches|Replying to |Waiting for a reply…|Write a message…/);
  assert.doesNotMatch(inbox, />Journey log<|>Posted<|>Sorting<|>Arrived</);
  assert.doesNotMatch(snail, /placeholder="Write something thoughtful|Stop this letter while it is still in transit/);
  assert.doesNotMatch(profile, />Report this profile<|placeholder="Tell us what happened/);
  assert.match(sort, /app\.introductions\.newestFirst/);
});

test("English and Spanish message catalogs keep the same key structure", async () => {
  const [en, es] = await Promise.all([read("src/i18n/messages/en.json"), read("src/i18n/messages/es.json")]);
  const flatten = (value, prefix = "") => Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return child && typeof child === "object" && !Array.isArray(child) ? flatten(child, path) : [path];
  });
  const enKeys = flatten(JSON.parse(en)).sort();
  const esKeys = flatten(JSON.parse(es)).sort();
  assert.deepEqual(esKeys, enKeys);
});
