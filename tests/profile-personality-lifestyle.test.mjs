import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20260903160000_add_personality_lifestyle_profile.sql", root), "utf8");
const personalityModule = await readFile(new URL("src/app/app/profile/[username]/PersonalityLifestyleSection.tsx", root), "utf8");
const page = await readFile(new URL("src/app/app/profile/[username]/page.tsx", root), "utf8");
const profileView = await readFile(new URL("src/app/app/profile/[username]/ProfileView.tsx", root), "utf8");

test("personality and lifestyle data is optional and constrained to non-sensitive choices", () => {
  for (const field of ["social_style", "daily_rhythm", "environment_preference", "travel_style", "pets"]) {
    assert.match(migration, new RegExp(`add column if not exists ${field}`));
    assert.match(migration, new RegExp(`${field} is null or`));
    assert.match(personalityModule, new RegExp(field));
  }
  assert.match(migration, /returns jsonb/);
  assert.match(migration, /viewer_can_access_profile\(p\.id\)/);
  assert.match(migration, /revoke all on function public\.get_public_personality_lifestyle\(uuid\) from public, anon/);
});

test("public personality module hides empty fields and stays independent", () => {
  assert.match(personalityModule, /if \(rows\.length === 0\) return null/);
  assert.match(personalityModule, /<dl/);
  assert.match(personalityModule, /heading/);
  assert.match(page, /get_public_personality_lifestyle/);
  assert.match(profileView, /<PersonalityLifestyleSection personality=\{personality\} heading=\{t\("app\.profile\.personality"\)\} \/>/);
});
