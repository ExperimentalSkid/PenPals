import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const actions = await readFile(new URL("src/app/app/profile/actions.ts", root), "utf8");
const setupPage = await readFile(new URL("src/app/app/profile/setup/page.tsx", root), "utf8");
const legacyEdit = await readFile(new URL("supabase/migrations/20260904252000_allow_legacy_profile_text_edits.sql", root), "utf8");
const onboardingMinimum = await readFile(new URL("supabase/migrations/20260905110000_onboarding_entry_minimum.sql", root), "utf8");

test("profile creation keeps story fields optional while legacy edits remain possible", () => {
  assert.match(setupPage, /name="bio" maxLength=\{500\}/);
  assert.match(setupPage, /name="quote" maxLength=\{240\}/);
  assert.doesNotMatch(setupPage, /name="bio" required=/);
  assert.doesNotMatch(setupPage, /name="quote" required=/);
  assert.match(actions, /existingProfile/);
  assert.match(actions, /prefer_not_to_say/);
  assert.match(actions, /onboardingNextStep/);
  assert.match(legacyEdit, /existing_profile boolean/);
  assert.match(onboardingMinimum, /focused onboarding gateway/i);
  assert.doesNotMatch(onboardingMinimum, /not existing_profile and char_length\(clean_quote\) < 1/);
  assert.match(legacyEdit, /char_length\(clean_quote\) > 240/);
});

test("a photo chosen before first profile save is retained for that new profile", () => {
  assert.match(actions, /penpals_pending_avatar/);
  assert.match(actions, /if \(!existingProfile\)/);
  assert.match(actions, /usablePendingAvatar/);
  assert.match(actions, /avatar_path: usablePendingAvatar/);
  assert.match(setupPage, /activeAvatarPath/);
});
