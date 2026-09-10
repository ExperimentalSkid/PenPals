import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

test("the legacy profile URL remains a compatibility redirect for live callers", async () => {
  const route = await readFile(new URL("src/app/profile/[username]/page.tsx", root), "utf8");
  assert.match(route, /redirect\(`\/app\/profile\/\$\{encodeURIComponent\(username\)\}`\)/);

  const discover = await readFile(new URL("src/app/app/discover/DiscoverResults.tsx", root), "utf8");
  const messageActions = await readFile(new URL("src/app/app/messages/actions.ts", root), "utf8");
  const profileActions = await readFile(new URL("src/app/app/profile/actions.ts", root), "utf8");
  assert.match(discover, /href=\{`\/profile\/\$\{encodeURIComponent\(profile\.username\)\}`\}/);
  assert.match(messageActions, /redirect\(`\/app\/profile\/\$\{encodeURIComponent\(username\)\}/);
  assert.match(profileActions, /redirect\(`\/profile\/\$\{String\(formData\.get\("username"\)\)/);
});

test("the obsolete moderation action module is removed while its route compatibility redirect remains", async () => {
  await assert.rejects(
    access(new URL("src/app/app/moderation/actions.ts", root)),
    (error) => error?.code === "ENOENT",
  );

  const route = await readFile(new URL("src/app/app/moderation/page.tsx", root), "utf8");
  assert.match(route, /requireStaff/);
  assert.match(route, /if \(role === "admin"\) redirect\("\/app\/admin"\)/);
  assert.match(route, /Moderator Panel/);
  assert.doesNotMatch(route, /from ["']\.\/actions/);
});
