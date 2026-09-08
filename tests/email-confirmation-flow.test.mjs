import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../src/app/auth/confirm/page.tsx", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;

async function renderConfirmation(search, { hash = "", exchangeError = null, verified = true, networkFailure = false } = {}) {
  const calls = { clients: [], exchange: [], otp: [], session: [], users: 0, redirects: [], errors: [] };
  const operation = { current: null };
  let effect;
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
  const imports = {
    react: { useEffect: (callback) => { effect = callback; }, useRef: () => operation,
      useState: () => [null, (value) => calls.errors.push(value)] },
    "react/jsx-runtime": { jsx: () => null, jsxs: () => null },
    "next/navigation": { useRouter: () => ({ replace: (path) => calls.redirects.push(path) }) },
    "@supabase/ssr": { createBrowserClient: (_url, _key, options) => { calls.clients.push(options); return { auth }; } },
    "@/app/components/BrandLogo": { default: () => null },
  };
  const testModule = { exports: {} };
  vm.runInNewContext(code, { module: testModule, exports: testModule.exports, URLSearchParams,
    window: { location: { search, hash } }, process: { env: {} },
    require: (name) => { assert.ok(name in imports, `Unexpected import ${name}`); return imports[name]; },
  });
  testModule.exports.default();
  const cleanup = effect();
  cleanup();
  effect(); // React development replay must not redeem another code.
  await operation.current;
  await new Promise(setImmediate);
  return calls;
}

test("fresh PKCE confirmation is exchanged once and reaches onboarding after effect replay", async () => {
  const result = await renderConfirmation("?code=fresh-test-code&sb_flow_id=test-flow");
  assert.equal(result.clients.length, 1);
  assert.equal(result.clients[0].auth.detectSessionInUrl, false);
  assert.equal(result.clients[0].isSingleton, false);
  assert.equal(result.exchange.length, 1);
  assert.equal(result.exchange[0][0], "fresh-test-code");
  assert.equal(result.exchange[0][1].flowId, "test-flow");
  assert.equal(result.users, 1);
  assert.deepEqual(result.redirects, ["/app/profile/setup"]);
  assert.deepEqual(result.errors, []);
});

test("token-hash recovery and existing fragment confirmations retain their destinations", async () => {
  const recovery = await renderConfirmation("?token_hash=test-token&type=recovery");
  assert.equal(recovery.otp.length, 1);
  assert.equal(recovery.exchange.length, 0);
  assert.deepEqual(recovery.redirects, ["/update-password"]);
  const fragment = await renderConfirmation("?type=email_change", { hash: "#access_token=test-access&refresh_token=test-refresh" });
  assert.equal(fragment.session.length, 1);
  assert.deepEqual(fragment.redirects, ["/app"]);
});

test("expired confirmation displays an error without continuing", async () => {
  const result = await renderConfirmation("?code=expired-test-code", { exchangeError: { message: "expired" } });
  assert.equal(result.users, 0);
  assert.deepEqual(result.redirects, []);
  assert.deepEqual(result.errors, ["Confirmation link is invalid or expired."]);
});

test("a confirmation still requires the server-confirmed email state", async () => {
  const result = await renderConfirmation("?code=test-code", { verified: false });
  assert.deepEqual(result.redirects, []);
  assert.deepEqual(result.errors, ["Confirmation link is invalid or expired."]);
});

test("network rejection leaves a recoverable error instead of an endless confirmation screen", async () => {
  const result = await renderConfirmation("?code=test-code", { networkFailure: true });
  assert.deepEqual(result.redirects, []);
  assert.deepEqual(result.errors, ["We couldn't confirm your email. Please try again."]);
});
