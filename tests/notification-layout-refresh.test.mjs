import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const introductionId = "11111111-1111-4111-8111-111111111111";
const conversationId = "22222222-2222-4222-8222-222222222222";

async function actionHarness(path, result = {}, signedIn = true) {
  const events = [];
  const db = {
    auth: { getClaims: async () => ({ data: signedIn ? { claims: { sub: "member" } } : null }) },
    rpc: async (name, args) => { events.push(["rpc", name, args]); return result; },
  };
  const imports = {
    "@/lib/supabase/server": { createClient: async () => db },
    "../guard": { requireStaff: async () => ({ db }) },
    "./guard": { requireStaff: async () => ({ db }) },
    "@/lib/email/resend": {
      sendPublicContactReplyEmail: async () => undefined,
      SupportEmailConfigurationError: class SupportEmailConfigurationError extends Error {},
      SupportEmailDeliveryError: class SupportEmailDeliveryError extends Error {},
    },
    "@/lib/profile-badges": { isManualProfileBadgeKey: () => false },
    "../investigation-context": { safeAdminReturnTo: () => "/app/admin/support" },
    "next/navigation": { redirect: (path) => { events.push(["redirect", path]); throw Object.assign(new Error("redirect"), { path }); } },
    "next/cache": { revalidatePath: (...args) => events.push(["revalidate", ...args]) },
  };
  const source = await readFile(new URL(path, root), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const testModule = { exports: {} };
  vm.runInNewContext(code, {
    module: testModule, exports: testModule.exports, URLSearchParams,
    require: (name) => { assert.ok(name in imports, `Unexpected import: ${name}`); return imports[name]; },
  });
  return { actions: testModule.exports, events };
}

function introductionForm() {
  const form = new FormData();
  form.set("introduction_id", introductionId);
  form.set("reply", "Thank you for the thoughtful introduction. I would enjoy talking about books.");
  return form;
}

for (const [action, rpc, destination] of [
  ["replyToIntroduction", "reply_to_introduction", `/app/messages/${conversationId}`],
  ["declineIntroduction", "decline_introduction", "/app/messages"],
]) {
  test(`${action} refreshes the notification shell after success and before navigation`, async () => {
    const { actions, events } = await actionHarness("src/app/app/messages/actions.ts", { data: conversationId, error: null });
    await assert.rejects(actions[action](introductionForm()), { path: destination });
    assert.deepEqual(events.map(([event]) => event), ["rpc", "revalidate", "redirect"]);
    assert.equal(events[0][1], rpc);
    assert.equal(events[0][2].introduction_id, introductionId);
    assert.deepEqual(events[1], ["revalidate", "/app", "layout"]);
  });

  test(`${action} does not invalidate or take its success route after a failed save`, async () => {
    const { actions, events } = await actionHarness("src/app/app/messages/actions.ts", { data: null, error: { message: "Save failed" } });
    await assert.rejects(actions[action](introductionForm()), (error) => error.path.startsWith("/app/introductions?error="));
    assert.deepEqual(events.map(([event]) => event), ["rpc", "redirect"]);
  });

  test(`${action} keeps the existing sign-in guard before mutation`, async () => {
    const { actions, events } = await actionHarness("src/app/app/messages/actions.ts", {}, false);
    await assert.rejects(actions[action](introductionForm()), { path: "/sign-in" });
    assert.deepEqual(events, [["redirect", "/sign-in"]]);
  });
}

test("a reply without a returned conversation does not claim a successful refresh", async () => {
  const { actions, events } = await actionHarness("src/app/app/messages/actions.ts", { data: null, error: null });
  await assert.rejects(actions.replyToIntroduction(introductionForm()), (error) => error.path.startsWith("/app/introductions?error="));
  assert.deepEqual(events.map(([event]) => event), ["rpc", "redirect"]);
});

for (const status of ["resolved", "open"]) {
  test(`support ${status} refreshes the staff inbox count after the database status change`, async () => {
    const { actions, events } = await actionHarness("src/app/app/admin/support/actions.ts", { error: null });
    const form = new FormData();
    form.set("ticket_id", introductionId);
    form.set("status", status);
    await assert.rejects(actions.setSupportTicketStatus(form), (error) => error.path.startsWith(`/app/admin/support/${introductionId}?`));
    assert.equal(events[0][1], "staff_set_support_ticket_status");
    assert.equal(events[0][2].new_status, status);
    assert.deepEqual(events.map(([event]) => event), ["rpc", "revalidate", "redirect"]);
    assert.deepEqual(events[1], ["revalidate", "/app", "layout"]);
  });
}

test("failed support status updates do not invalidate the shell", async () => {
  const { actions, events } = await actionHarness("src/app/app/admin/support/actions.ts", { error: { message: "Update failed" } });
  const form = new FormData();
  form.set("ticket_id", introductionId);
  form.set("status", "resolved");
  await assert.rejects(actions.setSupportTicketStatus(form), (error) => error.path.includes("error="));
  assert.deepEqual(events.map(([event]) => event), ["rpc", "redirect"]);
});

function caseStatusForm(status) {
  const form = new FormData();
  form.set("case_id", introductionId);
  form.set("status", status);
  form.set("resolution_category", "no_action");
  form.set("reason", "Reviewing the local QA case status.");
  return form;
}

for (const status of ["new", "triage", "investigating", "waiting", "resolved", "dismissed"]) {
  test(`moderation ${status} refreshes the inbox count after a successful status update`, async () => {
    const { actions, events } = await actionHarness("src/app/app/admin/actions.ts", { error: null });
    await assert.rejects(actions.updateModerationCaseStatus(caseStatusForm(status)), {
      path: `/app/admin/cases/${introductionId}?updated=status`,
    });
    assert.equal(events[0][1], "set_moderation_case_status");
    assert.equal(events[0][2].new_status, status);
    assert.equal(events[0][2].case_uuid, introductionId);
    assert.deepEqual(events.map(([event]) => event), ["rpc", "revalidate", "redirect"]);
    assert.deepEqual(events[1], ["revalidate", "/app", "layout"]);
  });
}

test("failed moderation status updates preserve feedback without invalidation", async () => {
  const { actions, events } = await actionHarness("src/app/app/admin/actions.ts", { error: { message: "Update failed" } });
  await assert.rejects(actions.updateModerationCaseStatus(caseStatusForm("dismissed")), {
    path: `/app/admin/cases/${introductionId}?error=Update%20failed`,
  });
  assert.deepEqual(events.map(([event]) => event), ["rpc", "redirect"]);
});

test("invalid moderation status is rejected before mutation and invalidation", async () => {
  const { actions, events } = await actionHarness("src/app/app/admin/actions.ts", { error: null });
  await assert.rejects(actions.updateModerationCaseStatus(caseStatusForm("unsupported")), (error) => error.path.includes("?error="));
  assert.deepEqual(events.map(([event]) => event), ["redirect"]);
});
