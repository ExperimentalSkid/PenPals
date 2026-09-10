import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../src/app/auth/confirm/ConfirmEmailClient.tsx", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2022,
  jsx: ts.JsxEmit.ReactJSX,
} }).outputText;

const labels = {
  eyebrow: "Confirm your email",
  title: "Finish signing in",
  description: "Confirm to continue.",
  confirming: "Confirming...",
  submit: "Confirm email",
  invalid: "Confirmation link is invalid or expired.",
  failure: "We couldn't confirm your email. Please try again.",
  returnLabel: "Return",
};
function findButton(node) {
  if (!node || typeof node !== "object") return null;
  if (node.type === "button" && typeof node.props?.onClick === "function") return node;
  const children = node.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = findButton(child);
    if (found) return found;
  }
  return null;
}

async function renderConfirmation(search, { hash = "", exchangeError = null, verified = true, networkFailure = false } = {}) {
  const calls = { clients: 0, exchange: [], otp: [], session: [], users: 0, redirects: [], errors: [], confirming: [] };
  const confirmation = { current: null };
  const auth = {
    exchangeCodeForSession: async (...args) => {
      calls.exchange.push(args);
      if (networkFailure) throw new Error("network unavailable");
      return { error: exchangeError };
    },
    verifyOtp: async (args) => { calls.otp.push(args); return { error: null }; },
    setSession: async (args) => { calls.session.push(args); return { error: null }; },
    getUser: async () => { calls.users++; return { data: { user: { email_confirmed_at: verified ? "2026-09-05" : null } } }; },
  };
  let stateCall = 0;
  const imports = {
    react: {
      useRef: () => confirmation,
      useState: (initial) => {
        stateCall += 1;
        if (stateCall === 1) return [initial, (value) => calls.errors.push(value)];
        return [initial, (value) => calls.confirming.push(value)];
      },
    },
    "react/jsx-runtime": {
      jsx: (type, props) => ({ type, props: props ?? {} }),
      jsxs: (type, props) => ({ type, props: props ?? {} }),
      Fragment: Symbol("Fragment"),
    },
    "next/navigation": { useRouter: () => ({ replace: (path) => calls.redirects.push(path) }) },
    "@/lib/supabase/client": { createClient: () => { calls.clients += 1; return { auth }; } },
    "@/app/components/BrandLogo": { default: () => null },
  };
  const testModule = { exports: {} };
  vm.runInNewContext(code, {
    module: testModule,
    exports: testModule.exports,
    URLSearchParams,
    window: { location: { search, hash } },
    require: (name) => { assert.ok(name in imports, `Unexpected import ${name}`); return imports[name]; },
  });
  const tree = testModule.exports.default({ locale: "en", labels });
  const button = findButton(tree);
  assert.ok(button, "confirmation button was not rendered");
  await button.props.onClick();
  return { ...calls, destinationFor: testModule.exports.confirmationDestination };
}

test("fresh PKCE confirmation is exchanged once and reaches onboarding", async () => {
  const result = await renderConfirmation("?code=fresh-test-code&sb_flow_id=test-flow");
  assert.equal(result.clients, 1);
  assert.equal(result.exchange.length, 1);
  assert.equal(result.exchange[0][0], "fresh-test-code");
  assert.equal(result.exchange[0][1].flowId, "test-flow");
  assert.equal(result.users, 1);
  assert.deepEqual(result.redirects, ["/app/profile/setup"]);
  assert.deepEqual(result.errors, []);
});

test("token-hash recovery and fragment confirmations retain their destinations", async () => {
  const recovery = await renderConfirmation("?token_hash=test-token&type=recovery");
  assert.equal(recovery.otp.length, 1);
  assert.deepEqual(recovery.redirects, ["/update-password"]);
  const fragment = await renderConfirmation("?type=email_change", { hash: "#access_token=test-access&refresh_token=test-refresh" });
  assert.equal(fragment.session.length, 1);
  assert.deepEqual(fragment.redirects, ["/app"]);
});
test("expired confirmation displays an error without continuing", async () => {
  const result = await renderConfirmation("?code=expired-test-code", { exchangeError: { message: "expired" }, verified: false });
  assert.deepEqual(result.redirects, []);
  assert.equal(result.errors.at(-1), labels.invalid);
});

test("a confirmation still requires the server-confirmed email state", async () => {
  const result = await renderConfirmation("?code=test-code", { verified: false });
  assert.deepEqual(result.redirects, []);
  assert.equal(result.errors.at(-1), labels.invalid);
});

test("network rejection leaves a recoverable error instead of an endless confirmation screen", async () => {
  const result = await renderConfirmation("?code=test-code", { networkFailure: true });
  assert.deepEqual(result.redirects, []);
  assert.equal(result.errors.at(-1), labels.failure);
});
