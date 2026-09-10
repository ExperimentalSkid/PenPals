import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const choices = await read("src/app/app/profile/ProfileChoices.tsx");
const signals = await read("src/app/app/profile/ProfileSignals.tsx");
const setup = await read("src/app/app/profile/setup/page.tsx");
const discoverFilters = await read("src/app/app/discover/DiscoverFilters.tsx");
const saveMigration = await read("supabase/migrations/20260904173000_extend_profile_save_signals.sql");
const catalogueMigration = await read("supabase/migrations/20260904180000_expand_interest_catalogue.sql");

test("profile setup searches the shared interest catalogue instead of rendering a fixed option wall", () => {
  assert.match(choices, /InlineSearchList/);
  assert.match(choices, /label=\{t\("app\.profile\.interests"\)\}/);
  assert.match(choices, /options=\{interests\.map\(\(interest\) => \(\{ value: String\(interest\.id\), label: interest\.name \}\)\)\}/);
  assert.match(choices, /placeholder=\{t\("app\.profile\.searchInterests"\)\}/);
  assert.match(choices, /selectedValues=\{chosen\.map\(String\)\}/);
  assert.match(choices, /name="interests" value=\{chosen\.join\(","\)\}/);
  assert.match(choices, /aria-label=\{t\("app\.profile\.remove", \{ name: interest\.name \}\)\}/);
  assert.doesNotMatch(choices, /interests\.map\(\(interest\) => \{ const selected = chosen\.includes/);
  assert.match(setup, /section="interests"/);
  assert.match(setup, /section="languages"/);
});

test("profile setup and Discover both source interests from the database catalogue", () => {
  assert.match(setup, /db\.from\("interests"\)\.select\("id,name"\)\.order\("name"\)/);
  assert.match(discoverFilters, /InlineSearchList/);
  assert.match(discoverFilters, /label=\{t\("app\.discover\.interest"\)\}/);
  assert.match(discoverFilters, /placeholder=\{t\("app\.discover\.searchInterests"\)\}/);
});

test("the shared interest catalogue covers ordinary hobbies without changing existing entries", () => {
  for (const interest of ["Football", "Basketball", "Coffee", "Gardening", "Podcasts", "Languages", "Coding", "Volunteering"]) {
    assert.match(catalogueMigration, new RegExp(`\\('${interest}'\\)`));
  }
  assert.match(catalogueMigration, /on conflict \(name\) do nothing/);
});

test("profile setup exposes the existing optional signals and saves them through an authenticated overload", () => {
  assert.match(setup, /ProfileSignals/);
  assert.match(signals, /name=\{field\.name\}/);
  for (const field of ["social_style", "daily_rhythm", "environment_preference", "travel_style", "pets"]) {
    assert.match(signals, new RegExp(`\"${field}\"`));
    assert.match(saveMigration, new RegExp(`p_${field}`));
  }
  for (const field of ["connection_goals", "conversation_style", "reply_pace"]) {
    assert.match(signals, new RegExp(`name=\"${field}\"`));
    assert.match(saveMigration, new RegExp(`p_${field}`));
  }
  assert.match(saveMigration, /create or replace function public\.save_profile\([\s\S]*p_reply_pace text/);
  assert.match(saveMigration, /grant execute on function public\.save_profile/);
});

test("profile setup fails closed when editable profile state cannot be loaded", () => {
  assert.match(setup, /const setupLoadFailed = Boolean\(/);
  assert.match(setup, /selectedLanguagesResult\.error/);
  assert.match(setup, /selectedInterestsResult\.error/);
  assert.match(setup, /regionsResult\.error/);
  assert.match(setup, /destinationsResult\.error/);
  assert.match(setup, /if \(setupLoadFailed\)/);
  assert.match(setup, /app\.profile\.loadError/);
});
