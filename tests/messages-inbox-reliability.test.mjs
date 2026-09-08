import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const senderId = "b613835c-50ee-49bd-8d13-72d195b2c68e";
const read = (path) => readFile(new URL(path, root), "utf8");
async function load(path, imports) {
  const code = ts.transpileModule(await read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const testModule = { exports: {} };
  vm.runInNewContext(code, { module: testModule, exports: testModule.exports, require: (name) => {
    if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
    return imports[name];
  } });
  return testModule.exports;
}

const avatar = await load("src/lib/avatar.ts", {});
const { createInboxProfileLoader } = await load("src/app/app/messages/inbox-profiles.ts", {
  "server-only": {}, "@/lib/avatar": avatar,
});

function profileDb({ allowed = true, identity = true, location = "Oslo, Norway", country = "Norway" } = {}) {
  const calls = [];
  return { calls, db: {
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === "resolve_profile_identity") return { data: identity ? [{ id: args.target_user, username: "penpal", display_name: "Pen Pal", age: 31, avatar_path: `${args.target_user}/photo.webp` }] : [] };
      if (name === "get_public_profile") return { data: { location_label: location, country } };
      if (name === "can_view_profile_photo") return { data: allowed };
      throw new Error(`Unexpected RPC: ${name}`);
    },
    storage: { from(bucket) {
      assert.equal(bucket, "avatars");
      return { async createSignedUrl(path, expires) {
        calls.push({ name: "sign", path, expires });
        return { data: { signedUrl: `signed:${path}` } };
      } };
    } },
  } };
}

test("many letters and conversations reuse in-flight identity, origin and photo checks per contact", async () => {
  const { db, calls } = profileDb();
  const profiles = createInboxProfileLoader(db, "viewer");
  await Promise.all(Array.from({ length: 25 }, () => Promise.all([
    profiles.identity(senderId), profiles.origin(senderId), profiles.photo(senderId),
  ])));
  for (const name of ["resolve_profile_identity", "get_public_profile", "can_view_profile_photo", "sign"]) {
    assert.equal(calls.filter((call) => call.name === name).length, 1, name);
  }
  const check = calls.find((call) => call.name === "can_view_profile_photo");
  assert.equal(check.args.owner_user, senderId);
  assert.equal(check.args.viewer_user, "viewer");
});

test("inbox caches never cross requests or viewers", async () => {
  const visible = profileDb();
  const hidden = profileDb({ allowed: false });
  assert.equal(await createInboxProfileLoader(visible.db, "viewer-a").photo(senderId), `signed:${senderId}/photo.webp`);
  assert.equal(await createInboxProfileLoader(hidden.db, "viewer-b").photo(senderId), null);
  assert.equal(hidden.calls.filter((call) => call.name === "sign").length, 0);
  await createInboxProfileLoader(visible.db, "viewer-a").photo(senderId);
  assert.equal(visible.calls.filter((call) => call.name === "can_view_profile_photo").length, 2);
});

test("distinct contacts are independently projected", async () => {
  const { db, calls } = profileDb();
  const profiles = createInboxProfileLoader(db, "viewer");
  await Promise.all([profiles.identity("one"), profiles.identity("two"), profiles.identity("one")]);
  assert.deepEqual(calls.map((call) => call.args.target_user), ["one", "two"]);
});

test("missing identities retain the existing anonymous fallback without photo or public lookups", async () => {
  const { db, calls } = profileDb({ identity: false });
  const profiles = createInboxProfileLoader(db, "viewer");
  assert.equal(await profiles.photo("missing"), null);
  assert.equal(await profiles.origin("missing"), null);
  assert.equal(calls.length, 1);
});

test("letter origins still use the guarded precision-aware label and country fallback", async () => {
  assert.equal(await createInboxProfileLoader(profileDb().db, "viewer").origin("sender"), "Oslo, Norway");
  assert.equal(await createInboxProfileLoader(profileDb({ location: " " }).db, "viewer").origin("sender"), "Norway");
  assert.equal(await createInboxProfileLoader(profileDb({ location: null, country: null }).db, "viewer").origin("sender"), null);
  const page = await read("src/app/app/messages/page.tsx");
  assert.match(page, /const profiles = createInboxProfileLoader\(db, uid\)/);
  assert.match(page, /enrichLetter\(profiles, letter/);
  assert.match(page, /if \(letter\.body_available \|\| letter\.letter_status === "delivered" \|\| letter\.delivered_at\)/);
});

async function messageActions(error = null) {
  const inserts = [];
  const invalidations = [];
  const actions = await load("src/app/app/messages/actions.ts", {
    "@/lib/supabase/server": { createClient: async () => ({
      auth: { getClaims: async () => ({ data: { claims: { sub: "sender" } } }) },
      from(table) {
        assert.equal(table, "messages", "message send must not make a second conversation write");
        return { async insert(row) { inserts.push(row); return { error }; } };
      },
    }) },
    "next/navigation": { redirect: (url) => { throw new Error(url); } },
    "next/cache": { revalidatePath: (...args) => invalidations.push(args) },
  });
  return { actions, inserts, invalidations };
}

test("successful message send has one insert and one success redirect", async () => {
  const { actions, inserts, invalidations } = await messageActions();
  const form = new FormData();
  form.set("conversation_id", "conversation"); form.set("body", " Hello pen pal! ");
  await assert.rejects(actions.sendMessage(form), { message: "/app/messages/conversation" });
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].body, "Hello pen pal!");
  assert.equal(inserts[0].sender_id, "sender");
  assert.deepEqual(invalidations, [], "sending a message does not change the sender's notification count");
});

test("a failed atomic message insert keeps the existing retry feedback", async () => {
  const { actions, inserts, invalidations } = await messageActions({ message: "Temporary database problem" });
  const form = new FormData();
  form.set("conversation_id", "conversation"); form.set("body", "Hello pen pal!");
  await assert.rejects(actions.sendMessage(form), (error) => decodeURIComponent(error.message).includes("We couldn't send that message. Please try again."));
  assert.equal(inserts.length, 1);
  assert.deepEqual(invalidations, []);
});

test("activity trigger is monotonic, atomic and does not grant a new client write path", async () => {
  const sql = await read("supabase/migrations/20260905430000_atomic_message_conversation_timestamp.sql");
  assert.match(sql, /returns trigger[\s\S]*security definer[\s\S]*set search_path = pg_catalog, public/);
  assert.match(sql, /revoke all on function public\.touch_message_conversation\(\) from public, anon, authenticated/);
  assert.match(sql, /after insert on public\.messages/i);
  assert.match(sql, /set updated_at = greatest\(c\.updated_at, new\.created_at\)/);
  assert.match(sql, /and c\.updated_at < new\.created_at/);
  assert.match(sql, /and c\.updated_at < latest\.created_at/);
  assert.doesNotMatch(sql, /create policy|grant\s/i);
});
