import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [rootLayout, globals, signUp, modal, choices, conversation, messages, notifications] = await Promise.all([
  read("src/app/layout.tsx"),
  read("src/app/globals.css"),
  read("src/app/sign-up/page.tsx"),
  read("src/app/profile/IcebreakerModal.tsx"),
  read("src/app/app/profile/ProfileChoices.tsx"),
  read("src/app/app/messages/[id]/ConversationThread.tsx"),
  read("src/app/app/messages/page.tsx"),
  read("src/app/app/notifications/page.tsx"),
]);

test("the application exposes skip navigation and a visible high-contrast focus treatment", () => {
  assert.match(rootLayout, /href="#main-content"/);
  assert.match(rootLayout, /id="main-content"/);
  assert.match(globals, /focus-visible[^\n]*outline: 3px solid var\(--penpals-navy\)/);
  assert.match(globals, /prefers-reduced-motion: reduce/);
});

test("authentication errors are associated with their form", () => {
  assert.match(signUp, /aria-describedby=\{error \? "sign-up-error"/);
  assert.match(signUp, /id="sign-up-error" role="alert"/);
});

test("the introduction dialog keeps focus contained and labels its message field", () => {
  assert.match(modal, /aria-describedby="icebreaker-description"/);
  assert.match(modal, /id="icebreaker-description"/);
  assert.match(modal, /id="icebreaker-text"/);
  assert.match(modal, /if \(wasOpen\.current\) triggerRef\.current\?\.focus\(\)/);
});

test("profile selectors expose unique controls and context-specific labels", () => {
  assert.match(choices, /aria-expanded=\{visible\.length > 0\}/);
  assert.match(choices, /app\.profile\.proficiencyFor/);
  assert.match(choices, /role="list" aria-label=\{t\("app\.profile\.selectedLanguages"\)\}/);
  assert.match(choices, /role="list" aria-label=\{t\("app\.profile\.selectedInterests"\)\}/);
});

test("message history and unread state have non-colour semantics", () => {
  assert.match(conversation, /role="log" aria-live="polite" aria-relevant="additions"/);
  assert.match(conversation, /className="sr-only">\{mine \? "You"/);
  assert.match(conversation, /aria-describedby=\{messageSendBlocked \? "message-composer-status"/);
  assert.match(messages, /className="sr-only">\{t\("app\.messages\.unread"\)\}<\/span>/);
  assert.match(notifications, /className="sr-only">\{t\("app\.notifications\.unreadNotification"\)\}<\/span>/);
});
