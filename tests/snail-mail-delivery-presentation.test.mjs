import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

async function load(path, imports = {}) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const testModule = { exports: {} };
  vm.runInNewContext(code, { module: testModule, exports: testModule.exports,
    require(name) { assert.ok(name in imports, `Unexpected import: ${name}`); return imports[name]; },
  });
  return testModule.exports;
}

const story = await load("src/app/app/messages/snailMailStory.ts");
const element = (type, props) => ({ type, props });
const { default: Panel } = await load("src/app/app/messages/[id]/SnailMailPanel.tsx", {
  react: { useEffect() {}, useState: (initial) => [initial, () => {}] },
  "react-dom": { useFormStatus: () => ({ pending: false }) },
  "react/jsx-runtime": { jsx: element, jsxs: element },
  "next/image": { default: () => null },
  "next-intl": { useTranslations: () => (key) => ({
    "app.snail.open": "Open letter",
    "app.snail.cancel": "Cancel letter",
    "app.snail.yourLetterArrived": "Your letter has arrived.",
    "app.snail.standard": "Standard",
    "app.snail.delivered": "Delivered",
    "app.snail.lastWaitingOpen": "Your last delivered letter is waiting to be opened.",
    "app.snail.incomingSealed": "A letter is on its way. The message opens when it arrives.",
    "app.snail.sealedUntilDelivery": "The letter is sealed until delivery.",
    "app.snail.lostTransit": "Lost in transit",
    "app.snail.lostBeforeReached": "This letter was lost before it reached you.",
    "app.snail.airMail": "Air mail",
    "app.snail.seaMail": "Sea mail",
    "app.snail.rarePigeon": "Rare pigeon",
    "app.snail.express": "Express",
    "app.snail.economy": "Economy",
    "app.snail.rail": "Rail",
  }[key] ?? key) },
  "@/app/app/messages/actions": {},
  "@/app/app/messages/snailMailStory": story,
  "@/app/app/messages/SnailMailJourneyMap": { default: () => null },
});
const now = Date.parse("2026-09-08T12:00:00Z");
const letter = {
  id: "qa-letter", sender_id: "sender", recipient_id: "recipient",
  sent_at: "2026-09-07T10:00:00Z", deliver_at: "2026-09-08T10:00:00Z",
  delivered_at: null, recipient_read_at: null, body: "A local QA letter.",
  body_available: true, unread: false, letter_status: "delivered",
};
function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join(" ");
  if (tree == null || typeof tree === "boolean") return "";
  return typeof tree === "object" ? text(tree.props?.children) : String(tree);
}
function render(changes = {}, userId = "recipient", compact = true) {
  return text(Panel({ conversationId: "qa-conversation", userId, letters: [{ ...letter, ...changes }], now, canCompose: true, compact })).replace(/\s+/g, " ");
}

test("arrival follows the current ETA projection before and after the worker records delivery", () => {
  const eta = Date.parse(letter.deliver_at);
  assert.equal(story.hasSnailMailArrived(letter, eta - 1), false);
  assert.equal(story.hasSnailMailArrived(letter, eta), true);
  assert.equal(story.hasSnailMailArrived(letter, now), true);
  assert.equal(story.hasSnailMailArrived({ ...letter, delivered_at: letter.deliver_at }, now), true);
});

for (const compact of [true, false]) {
  test(`arrived unread letter can be opened before worker delivery (${compact ? "compact" : "full"})`, () => {
    const result = render({}, "recipient", compact);
    assert.match(result, /Your letter has arrived\./);
    assert.match(result, /Standard · Delivered/);
    assert.match(result, /Open letter/);
    assert.doesNotMatch(result, /on its way|sealed until delivery/);
  });

  test(`read letters have no repeat-open action (${compact ? "compact" : "full"})`, () => {
    assert.doesNotMatch(render({ delivered_at: letter.deliver_at, recipient_read_at: letter.deliver_at }, "recipient", compact), /Open letter/);
  });

  test(`arrived outgoing letters stay blocked pending reading but cannot be cancelled (${compact ? "compact" : "full"})`, () => {
    const result = render({ letter_status: "outgoing" }, "sender", compact);
    assert.match(result, /waiting to be opened/);
    assert.doesNotMatch(result, /Cancel letter|still on its way|Open letter/);
  });

  test(`in-transit letters retain sender cancellation and recipient sealing (${compact ? "compact" : "full"})`, () => {
    const travelling = { deliver_at: "2026-09-09T10:00:00Z", letter_status: "incoming", body: null, body_available: false };
    const received = render(travelling, "recipient", compact);
    assert.match(received, /on its way/);
    assert.match(received, /sealed until delivery/);
    assert.doesNotMatch(received, /Open letter|has arrived/);
    assert.match(render({ ...travelling, letter_status: "outgoing", body: letter.body, body_available: true }, "sender", compact), /Cancel letter/);
  });

  test(`cancelled letters never appear delivered or readable (${compact ? "compact" : "full"})`, () => {
    const cancelled = { ...letter, letter_status: "lost_in_transit", body: null, body_available: false };
    assert.equal(story.hasSnailMailArrived(cancelled, now), false);
    const result = render(cancelled, "recipient", compact);
    assert.match(result, /Lost in transit/);
    assert.doesNotMatch(result, /Open letter|has arrived|Standard · Delivered/);
  });
}
