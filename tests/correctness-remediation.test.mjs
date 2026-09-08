import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../supabase/migrations/20260902130000_correctness_discovery_response_identity.sql", import.meta.url), "utf8");
const saveMigration = await readFile(new URL("../supabase/migrations/20260902131000_atomic_profile_settings_saves.sql", import.meta.url), "utf8");
const discoverPage = await readFile(new URL("../src/app/app/discover/page.tsx", import.meta.url), "utf8");
const profilePage = await readFile(new URL("../src/app/app/profile/[username]/page.tsx", import.meta.url), "utf8");
const messagesPage = await readFile(new URL("../src/app/app/messages/inbox-profiles.ts", import.meta.url), "utf8");
const conversationPage = await readFile(new URL("../src/app/app/messages/[id]/page.tsx", import.meta.url), "utf8");
const introductionsPage = await readFile(new URL("../src/app/app/introductions/page.tsx", import.meta.url), "utf8");
const actions = await readFile(new URL("../src/app/app/profile/actions.ts", import.meta.url), "utf8");

test("incomplete and inactive profiles are excluded from discovery", () => {
  for (const field of ["display_name", "birth_date", "gender", "country", "city", "bio", "quote", "looking_for", "avatar_path"]) {
    assert.match(migration, new RegExp(`p\\.${field}`));
  }
  assert.match(migration, /last_active_at >= now\(\) - interval '7 days'/);
  assert.match(migration, /deactivated_at is null/);
  assert.match(migration, /count\(\*\).*profile_interests[\s\S]*>= 3/);
  assert.match(migration, /order by p\.last_active_at desc nulls last/);
});

test("discovery remains photo-free while retaining activity ordering", () => {
  assert.match(migration, /null::text/);
  assert.match(discoverPage, /get_discover_profiles/);
  assert.doesNotMatch(discoverPage, /avatar_path|<Image/);
});

test("declined and replied introductions use an immutable decision timestamp", () => {
  assert.match(migration, /add column if not exists handled_at timestamptz/);
  assert.match(migration, /old\.status = 'pending' and new\.status in \('replied', 'declined'\)/);
  assert.match(migration, /new\.handled_at := now\(\)/);
  assert.match(migration, /handled_at - created_at/);
  assert.match(migration, /status = 'expired'/);
  assert.match(migration, /status in \('replied', 'declined'\) and i\.handled_at is not null/);
});

test("decline response time uses the decision instant instead of zero", () => {
  const created = Date.parse("2026-09-01T08:00:00Z");
  const declined = Date.parse("2026-09-03T20:00:00Z");
  const hours = (declined - created) / 3_600_000;
  assert.equal(hours, 60);
  assert.notEqual(hours, 0);
  assert.match(migration, /order by extract\(epoch from \(handled_at - created_at\)\)/);
});

test("response visibility is enforced for the viewer", () => {
  assert.match(migration, /p\.show_response_rate/);
  assert.match(migration, /public\.viewer_can_access_profile\(p\.id\)/);
  assert.match(migration, /case when completed >= 5 then/);
});

test("identity resolution is independent of discovery eligibility", () => {
  assert.match(migration, /create or replace function public\.resolve_profile_identity/);
  for (const page of [profilePage, messagesPage, conversationPage, introductionsPage]) {
    assert.match(page, /resolve_profile_identity/);
    assert.doesNotMatch(page, /get_discover_profiles/);
  }
  assert.match(migration, /case when public\.can_view_profile_photo\(p\.id, auth\.uid\(\)\)/);
});

test("profile and privacy saves are atomic and surface persistence failures", () => {
  assert.match(actions, /rpc\("save_profile"/);
  assert.match(actions, /rpc\("save_privacy_settings"/);
  assert.match(actions, /if \(error\) profileErrorRedirect/);
  assert.match(actions, /if \(error\) redirect\(`\/app\/settings/);
  assert.match(saveMigration, /delete from public\.profile_languages/);
  assert.match(saveMigration, /delete from public\.profile_interests/);
  assert.match(saveMigration, /raise exception 'Please check your profile details'/);
});

test("failed profile persistence cannot produce a success redirect", () => {
  const rpcBlock = actions.slice(actions.indexOf('rpc("save_profile"'), actions.indexOf('export async function uploadAvatar'));
  assert.match(rpcBlock, /if \(error\)/);
  assert.doesNotMatch(rpcBlock.slice(0, rpcBlock.indexOf("if (error)")), /redirect\("\/app"\)/);
});
