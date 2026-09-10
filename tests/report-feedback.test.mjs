import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const confirmation = "Thanks for letting us know. We'll review your report.";

// Render the real Server Component tree with an empty authorized conversation
// fixture. These checks exercise query-state presentation without submitting
// reports or changing the real database.
async function loadPage(path) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const db = {
    auth: { getClaims: async () => ({ data: { claims: { sub: "test-member" } } }) },
    rpc: async () => ({ data: null, error: null }),
    from(table) {
      let otherParticipant = false;
      return {
        select() { return this; }, eq() { return this; }, is() { return this; }, order() { return this; },
        limit() { return this; }, or() { return this; },
        neq() { otherParticipant = true; return this; },
        maybeSingle: async () => ({ data: table === "conversation_participants" && !otherParticipant ? { conversation_id: "test-conversation" } : table === "conversations" ? { communication_mode: "instant" } : null, error: null }),
        then(resolve) { return Promise.resolve({ data: [], error: null }).then(resolve); },
      };
    },
  };
  const element = (type, props) => ({ type, props });
  const component = () => null;
  const imports = {
    "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: "fragment" },
    "next/image": { default: component }, "next/link": { default: component },
    "next/navigation": { redirect() { throw new Error("Unexpected redirect"); }, notFound() { throw new Error("Unexpected notFound"); } },
    "@/lib/supabase/server": { createClient: async () => db },
    "@/app/app/messages/actions": { markRead: async () => null },
    "@/app/app/messages/snailMailStory": { isLostInTransit: () => false },
    "@/app/PresenceProvider": { PresenceStatus: component },
    "@/app/app/profile/BlockControl": { default: component },
    "@/app/app/reports/actions": {},
    "@/app/components/LanguageFlag": { default: component },
    "./ConversationThread": { default: component }, "./SnailMailPanel": { default: component },
    "./IntroductionSort": { default: component },
    "@/app/components/CountryFlag": { default: component },
    "@/lib/countries": {}, "@/lib/avatar": {},
    "@/lib/language-compatibility": { deriveLanguageCompatibility: () => null },
    "@/i18n/server": { getPageI18n: async () => ({ locale: "en", t: (key) => ["app.messages.reported", "app.introductions.reported"].includes(key) ? confirmation : key }) },
  };
  const testModule = { exports: {} };
  vm.runInNewContext(code, { module: testModule, exports: testModule.exports, URLSearchParams,
    require(name) { assert.ok(name in imports, `Unexpected import: ${name}`); return imports[name]; },
  });
  return testModule.exports.default;
}

function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...nodes(tree.props?.children)];
}

function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join("");
  if (tree == null || typeof tree === "boolean") return "";
  return typeof tree === "object" ? text(tree.props?.children) : String(tree);
}

for (const path of ["src/app/app/messages/[id]/page.tsx", "src/app/app/introductions/page.tsx"]) {
  const Page = await loadPage(path);
  const render = (query) => Page({ params: Promise.resolve({ id: "test-conversation" }), searchParams: Promise.resolve(query) });

  test(`${path}: successful report shows one accessible confirmation`, async () => {
    const feedback = nodes(await render({ reported: "1" })).filter((node) => text(node) === confirmation && node.type === "p");
    assert.equal(feedback.length, 1);
    assert.equal(feedback[0].props.role, "status");
    assert.match(feedback[0].props.className, /notice-success/);
  });

  test(`${path}: no confirmation without a successful-report marker`, async () => {
    for (const reported of [undefined, "", "0"]) {
      assert.ok(!text(await render({ reported })).includes(confirmation));
    }
  });

  test(`${path}: existing error feedback remains an alert`, async () => {
    const tree = await render({ error: "Please choose a report reason." });
    const alerts = nodes(tree).filter((node) => node.props?.role === "alert");
    assert.ok(alerts.some((node) => text(node) === "Please choose a report reason."));
    assert.ok(!text(tree).includes(confirmation));
  });
}
