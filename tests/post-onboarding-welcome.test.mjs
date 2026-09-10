import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [migration, actions, page, profileActions, proxy, layout, en, es] = await Promise.all([
  read("supabase/migrations/20260910211500_post_onboarding_welcome.sql"),
  read("src/app/app/welcome/actions.ts"),
  read("src/app/app/welcome/page.tsx"),
  read("src/app/app/profile/actions.ts"),
  read("src/lib/supabase/proxy.ts"),
  read("src/app/app/layout.tsx"),
  read("src/i18n/messages/en.json").then(JSON.parse),
  read("src/i18n/messages/es.json").then(JSON.parse),
]);

test("newly completed profiles go through one welcome gate before the app", () => {
  assert.match(migration, /onboarding_welcome_completed_at timestamptz/);
  assert.match(profileActions, /redirect\(existingProfile \? "\/app" : "\/app\/welcome"\)/);
  assert.match(proxy, /profileComplete && !profile\?\.onboarding_welcome_completed_at/);
  assert.match(proxy, /new URL\("\/app\/welcome", request\.url\)/);
  assert.match(layout, /welcomeLocked/);
  assert.match(layout, /onboardingLocked \|\| welcomeLocked/);
});

test("existing complete profiles are backfilled without skipping incomplete accounts", () => {
  assert.match(migration, /update public\.profiles p/);
  assert.match(migration, /nullif\(trim\(p\.username\), ''\) is not null/);
  assert.match(migration, /exists \(select 1 from public\.profile_languages/);
  assert.match(migration, /exists \(select 1 from public\.profile_interests/);
  assert.match(migration, /where nullif\(trim\(p\.username\), ''\) is not null[\s\S]*profile_languages[\s\S]*profile_interests/);
});

test("welcome completion is authenticated, profile-complete, and idempotent", () => {
  assert.match(migration, /me uuid := auth\.uid\(\)/);
  assert.match(migration, /language_count < 1/);
  assert.match(migration, /interest_count < 1/);
  assert.match(migration, /coalesce\(onboarding_welcome_completed_at, now\(\)\)/);
  assert.match(migration, /grant execute on function public\.complete_my_onboarding_welcome\(\) to authenticated/);
  assert.match(actions, /db\.rpc\("complete_my_onboarding_welcome"\)/);
  assert.match(actions, /redirect\("\/app\/discover"\)/);
});

test("welcome screen presents core rules and policy links in both locales", () => {
  for (const key of ["friendship", "adult", "boundaries", "sexual", "spam", "safety"]) assert.match(page, new RegExp(`"${key}"`));
  assert.match(page, /href="\/guidelines"/);
  assert.match(page, /href="\/terms"/);
  assert.match(page, /href="\/privacy"/);
  assert.match(en.welcome.rules.spamBody, /three unanswered/i);
  assert.match(es.welcome.rules.spamBody, /tres envíos sin respuesta/i);
  assert.deepEqual(Object.keys(en.welcome).sort(), Object.keys(es.welcome).sort());
});
