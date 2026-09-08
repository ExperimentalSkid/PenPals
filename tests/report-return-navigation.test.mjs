import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../src/app/app/reports/actions.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

async function submit(returnTo, { error = null, declinePending = false, authenticated = true } = {}) {
  const calls = [];
  const events = [];
  const testModule = { exports: {} };
  const redirectSignal = new Error("redirect");
  let destination;
  const imports = {
    "@/lib/supabase/server": { createClient: async () => ({
      auth: { getClaims: async () => ({ data: { claims: authenticated ? { sub: "test-member" } : null } }) },
      rpc: async (name, args) => { calls.push({ name, args: { ...args } }); events.push("report"); return { error }; },
    }) },
    "next/cache": { revalidatePath: (path, type) => events.push(`refresh:${path}:${type}`) },
    "next/navigation": { redirect: (path) => { destination = path; events.push("redirect"); throw redirectSignal; } },
  };
  vm.runInNewContext(code, {
    module: testModule, exports: testModule.exports, URL,
    require: (name) => {
      assert.ok(name in imports, `Unexpected import: ${name}`);
      return imports[name];
    },
  });
  const form = new FormData();
  if (returnTo !== null) form.set("return_to", returnTo);
  form.set("target_type", "introduction");
  form.set("target_id", "test-introduction");
  form.set("reason", "other");
  form.set("details", "Local test report details.");
  if (declinePending) form.set("decline_pending", "on");
  await assert.rejects(testModule.exports.submitReport(form), (error) => error === redirectSignal);
  return { destination, calls, events };
}

test("report success retains all existing caller destinations", async () => {
  for (const path of ["/app/profile/test_member", "/app/messages/test-conversation", "/app/introductions"]) {
    assert.equal((await submit(path)).destination, `${path}?reported=1`);
  }
});

test("report feedback precedes the fragment and preserves existing query state", async () => {
  const { destination } = await submit("/app/messages/test-conversation?from=profile#message-note");
  assert.equal(destination, "/app/messages/test-conversation?from=profile&reported=1#message-note");
});

test("repeated feedback updates the existing parameter instead of duplicating it", async () => {
  const { destination } = await submit("/app/introductions?reported=0&status=pending#introduction");
  assert.equal(destination, "/app/introductions?reported=1&status=pending#introduction");
});

test("missing and malformed internal return paths use the existing fallback", async () => {
  const invalidPaths = [null, "", "app/introductions", "https://example.test/", "//example.test/",
    "/app/messages\\thread", "/app/intro\nductions", "/app/intro\tductions", "/app/intro\0ductions", "/app/intro\x7fductions"];
  for (const path of invalidPaths) {
    assert.equal((await submit(path)).destination, "/app/discover?reported=1");
  }
});

test("report errors remain useful while query and fragment handling is correct", async () => {
  const message = "Choose a reason & try again.";
  const result = await submit("/app/introductions?error=old#report", { error: { message } });
  const parsed = new URL(result.destination, "https://penpal.invalid");
  assert.equal(parsed.searchParams.get("error"), message);
  assert.equal(parsed.searchParams.getAll("error").length, 1);
  assert.equal(parsed.hash, "#report");
  const limited = await submit("/app/introductions", { error: { message: "Please wait before submitting another report. Retry later." } });
  assert.equal(new URL(limited.destination, "https://penpal.invalid").searchParams.get("error"), "Please wait before submitting another report.");
  const fallback = await submit("/app/introductions", { error: { message: "" } });
  assert.equal(new URL(fallback.destination, "https://penpal.invalid").searchParams.get("error"), "We couldn't submit that report.");
});

test("report target, details and optional decline behavior are unchanged", async () => {
  for (const declinePending of [false, true]) {
    const { calls } = await submit("/app/introductions", { declinePending });
    assert.deepEqual(calls, [{ name: "submit_report", args: {
      kind: "introduction", target: "test-introduction", report_reason: "other",
      report_details: "Local test report details.", decline_pending: declinePending,
    } }]);
  }
});

test("signed-out submissions still stop before the report RPC", async () => {
  const result = await submit("/app/introductions", { authenticated: false });
  assert.equal(result.destination, "/sign-in");
  assert.deepEqual(result.calls, []);
});

test("report-and-decline refreshes notification navigation only after a successful report", async () => {
  assert.deepEqual((await submit("/app/introductions", { declinePending: true })).events,
    ["report", "refresh:/app:layout", "redirect"]);
  assert.deepEqual((await submit("/app/introductions")).events, ["report", "redirect"]);
  assert.deepEqual((await submit("/app/introductions", { declinePending: true, error: { message: "Report could not be saved." } })).events,
    ["report", "redirect"]);
});
