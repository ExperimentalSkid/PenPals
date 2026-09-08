import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
async function load(path, imports = {}, env = {}) {
  const code = ts.transpileModule(await read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const testModule = { exports: {} };
  vm.runInNewContext(code, { module: testModule, exports: testModule.exports, require: (name) => {
    if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
    return imports[name];
  }, URL, Date, process: { env } });
  return testModule.exports;
}

test("badge data is reusable without importing UI and manual keys exclude system badges", async () => {
  const badges = await load("src/lib/profile-badges.ts");
  assert.equal(Object.keys(badges.PROFILE_BADGE_DEFINITIONS).length, 88);
  assert.equal(badges.MANUAL_PROFILE_BADGE_KEYS.length, 7);
  for (const key of badges.MANUAL_PROFILE_BADGE_KEYS) assert.ok(badges.PROFILE_BADGE_DEFINITIONS[key]);
  assert.equal(badges.isManualProfileBadgeKey("verified"), false);
  assert.equal(badges.isManualProfileBadgeKey("early-member-platinum"), false);
  assert.equal(badges.isManualProfileBadgeKey("helpful-penpal"), true);
  assert.match(await read("src/app/app/admin/actions.ts"), /isManualProfileBadgeKey\(badgeKey\)/);
  assert.match(await read("src/app/app/admin/users/[id]/AdminProfileBadgeActions.tsx"), /useFormStatus\(\)/);
});

test("badge tooltips remain within their badge width and hidden until focus/hover", async () => {
  const component = await read("src/app/components/ProfileBadge.tsx");
  assert.match(component, /role="tooltip" className="[^"]*invisible[^\n]*w-full/);
  assert.match(component, /group-focus:visible/);
  assert.doesNotMatch(component, /w-max max-w-\[min\(18rem/);
});

test("one discovered proxy and one shared support viewer replace unused entry points", async () => {
  for (const path of ["proxy.ts", "src/app/app/Nav.tsx", "src/lib/activity-status.ts", "src/app/app/admin/support/[id]/SupportAttachmentViewer.tsx"]) {
    await assert.rejects(access(new URL(path, root)), { code: "ENOENT" });
  }
  await access(new URL("src/proxy.ts", root));
  await access(new URL("src/app/app/support/SupportAttachmentViewer.tsx", root));
  assert.doesNotMatch(await read("src/lib/avatar.ts"), /object\/public\/avatars/);
});

test("SEO metadata and rendering share normalized request-local reads", async () => {
  let reads = 0;
  const seo = await load("src/lib/seo/public.ts", {
    react: { cache: (fn) => { const entries = new Map(); return (...args) => {
      const key = JSON.stringify(args);
      if (!entries.has(key)) entries.set(key, fn(...args));
      return entries.get(key);
    }; } },
    "@/lib/supabase/server": { createClient: async () => ({ rpc: async (_, args) => {
      reads++;
      return { data: [{ surface_dimension: args.p_dimension, canonical_slug: args.p_slug, canonical_name: "Spain",
        aggregate_key: "country:ES", member_count: 100, cohort_size: 100, calculated_at: "2026-09-05T00:00:00Z", related: {} }] };
    } }) },
  });
  await Promise.all([seo.loadPublicSeoSurface("country", "Spain"), seo.loadPublicSeoSurface("country", "spain")]);
  assert.equal(reads, 1);
});

test("onboarding redirects retain freshly rotated session cookies", async () => {
  const makeResponse = (url) => {
    const values = new Map();
    return { url, cookies: { getAll: () => [...values.values()], set: (...args) => {
      const cookie = typeof args[0] === "object" ? args[0] : { name: args[0], value: args[1], ...args[2] };
      values.set(cookie.name, cookie);
    } } };
  };
  const { updateSession } = await load("src/lib/supabase/proxy.ts", {
    "next/server": { NextResponse: { next: () => makeResponse(null), redirect: (url) => makeResponse(url) } },
    "@/lib/profile-completeness": { hasCompletedProfile: () => false },
    "@supabase/ssr": { createServerClient: (_, __, options) => ({
      auth: { getClaims: async () => { options.cookies.setAll([{ name: "session", value: "rotated", options: { httpOnly: true } }]); return { data: { claims: { sub: "new-member" } } }; } },
      from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: null }), count: 0 }),
    }) },
  });
  const result = await updateSession({ url: "http://localhost:3000/app/discover", nextUrl: { pathname: "/app/discover" }, cookies: { getAll: () => [], set() {} } });
  assert.equal(result.url.pathname, "/app/profile/setup");
  assert.equal(result.cookies.getAll()[0].value, "rotated");
  assert.equal(result.cookies.getAll()[0].httpOnly, true);
});

test("local email confirmation keeps its initiating origin while production stays canonical", async () => {
  const imports = { "@supabase/supabase-js": {}, "@/lib/verification/oauth": { VerificationConfigurationError: Error } };
  const local = await load("src/lib/verification/server.ts", imports, { NODE_ENV: "development" });
  assert.equal(local.emailConfirmationOrigin(new Headers({ origin: "http://127.0.0.1:3000" })), "http://127.0.0.1:3000");
  assert.equal(local.emailConfirmationOrigin(new Headers({ origin: "http://localhost:3000" })), "http://localhost:3000");
  const production = await load("src/lib/verification/server.ts", imports, { NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: "https://pen-pals.net" });
  assert.equal(production.emailConfirmationOrigin(new Headers({ origin: "http://127.0.0.1:3000" })), "https://pen-pals.net");
});

test("successful profile saves refresh the shared app layout before redirecting", async () => {
  const events = [];
  const actions = await load("src/app/app/profile/actions.ts", {
    "@/lib/supabase/server": { createClient: async () => ({
      auth: { getClaims: async () => ({ data: { claims: { sub: "test-member" } } }) },
      from: () => ({ select() { return this; }, eq() { return this; },
        maybeSingle: async () => ({ data: { id: "test-member", username: "test_member" }, error: null }) }),
      rpc: async () => { events.push("save"); return { data: null, error: null }; },
    }) },
    "next/navigation": { redirect: (path) => { events.push(path); throw new Error("redirect"); } },
    "next/cache": { revalidatePath: (path, type) => events.push(`refresh:${path}:${type}`) },
    "next/headers": { cookies: async () => ({ get: () => undefined }) },
    "@/lib/avatar": { isPrivateAvatarPath: () => false },
    "@/lib/profile-completeness": { hasCompletedProfile: () => true, onboardingNextStep: () => null },
  });
  const form = new FormData();
  form.set("display_name", "Test Member");
  form.set("birth_date", "1995-03-21");
  form.set("country", "Norway");
  await assert.rejects(actions.saveProfile(form), /redirect/);
  assert.deepEqual(events, ["save", "refresh:/app:layout", "/app"]);
  assert.match(await read("src/app/app/profile/setup/page.tsx"), /profile\?\.gender === "prefer_not_to_say" \? ""/);
});
