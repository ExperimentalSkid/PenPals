import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const modal = await readFile(new URL("src/app/profile/IcebreakerModal.tsx", root), "utf8");
const actions = await readFile(new URL("src/app/app/messages/actions.ts", root), "utf8");

test("quality rejection clears the composer and returns focus to the empty textarea", () => {
  assert.match(modal, /state\.status !== "quality"/);
  assert.match(modal, /setText\(""\)/);
  assert.match(modal, /composerRef\.current\?\.focus\(\)/);
});

test("quality guidance is separate UI text and never textarea content", () => {
  assert.match(modal, /id="icebreaker-quality-guidance"/);
  assert.match(modal, /app\.icebreaker\.guidance/);
  assert.match(modal, /value=\{text\}/);
  assert.doesNotMatch(modal, /value=\{qualityGuidance/);
});

test("quality guidance stays outside the textarea and does not replace its placeholder", () => {
  assert.match(modal, /id="icebreaker-quality-guidance"[\s\S]*<\/p>}\s*<textarea/);
  assert.match(modal, /placeholder=\{placeholder\}/);
  assert.match(modal, /contextualPrompts\(recipientName, interestNames\)/);
  assert.match(modal, /Ask \{name\} about the last book they couldn['’]t put down/);
  assert.doesNotMatch(modal, /placeholder="[^"]*Write a genuine introduction/);
});

test("guidance disappears only after the user starts a new introduction", () => {
  assert.match(modal, /if \(nextText\.length > 0\) setQualityGuidance\(false\)/);
  assert.match(modal, /text\.length >= 50/);
});

test("only deterministic quality failures clear text; other failures preserve it", () => {
  assert.match(actions, /isDeterministicQualityRejection/);
  assert.match(actions, /status: "quality"/);
  assert.match(actions, /status: "error"/);
  assert.ok(actions.includes("repeated\\s+characters"));
  assert.doesNotMatch(actions, /icebreaker\\s+must\\s+be/);
  assert.match(actions, /try \{[\s\S]*db\.rpc\("submit_introduction"/);
});

test("empty composer cannot submit the guidance as an introduction", () => {
  assert.match(modal, /value=\{text\}/);
  assert.match(modal, /disabled=\{pending \|\| !valid\}/);
  assert.match(modal, /data-ready=\{ready \? "true" : "false"\}/);
  assert.match(modal, /const valid = text\.length >= 50/);
});
