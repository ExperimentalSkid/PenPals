import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20260903000000_activity_ranks_and_inactive_mode.sql", root), "utf8");
const settings = await readFile(new URL("src/app/app/settings/page.tsx", root), "utf8");
const profileActions = await readFile(new URL("src/app/app/profile/actions.ts", root), "utf8");
const presence = await readFile(new URL("src/app/PresenceProvider.tsx", root), "utf8");
const proxy = await readFile(new URL("src/lib/supabase/proxy.ts", root), "utf8");
const profileView = await readFile(new URL("src/app/app/profile/[username]/ProfileView.tsx", root), "utf8");
const adminUser = await readFile(new URL("src/app/app/admin/users/[id]/page.tsx", root), "utf8");

test("rank thresholds and display copy are centralized", () => {
  for (const rank of ["Passing Notes", "Postcard Scribbler", "Letter Writer", "Correspondent", "Seasoned Penpal", "Ink Veteran", "Master Correspondent"]) {
    assert.match(migration, new RegExp(`'[^']+', '${rank.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}'`));
  }
  assert.match(migration, /activity_rank_definitions/);
  assert.match(migration, /minimum_score integer not null/);
});

test("activity signals are bounded and idempotent", () => {
  assert.match(migration, /unique \(user_id, event_key\)/);
  assert.match(migration, /on conflict \(user_id, event_key\) do nothing/);
  assert.match(migration, /event_type in \('active_day', 'accepted_conversation', 'healthy_response'\)/);
  assert.match(migration, /\) >= 3 then return/);
  assert.match(migration, /when 'accepted_conversation' then 6/);
  assert.match(migration, /when 'healthy_response' then 4/);
});

test("rank calculation has a grace period, gradual decay, and hysteresis", () => {
  assert.match(migration, /grace_days constant integer := 30/);
  assert.match(migration, /least\(lifetime \* 0\.50, coalesce\(state_row\.resume_decay_base, 0\) \+ elapsed_days \* 0\.10\)/);
  assert.match(migration, /score < greatest\(0, current_minimum - 5\)/);
});

test("pause is an explicit state distinct from account deactivation", () => {
  assert.match(migration, /add column if not exists inactive_mode boolean not null default false/);
  assert.match(migration, /add column if not exists accepting_new_conversations_before_inactive boolean/);
  assert.match(migration, /deactivated_at is null/);
  assert.match(migration, /profiles_inactive_mode_guard/);
  assert.match(migration, /Inactive mode changes require the protected settings action/);
  assert.doesNotMatch(migration, /set deactivated_at =/i);
});

test("settings uses the protected save action to pause and resume", () => {
  assert.match(settings, /name="inactive_mode"/);
  assert.match(settings, /defaultChecked=\{p\?\.inactive_mode === true\}/);
  assert.match(profileActions, /p_inactive_mode: formData\.get\("inactive_mode"\) === "on"/);
  assert.match(migration, /p_inactive_mode boolean default false/);
  assert.match(migration, /grant execute on function public\.save_privacy_settings\([^)]*boolean\) to authenticated/);
});

test("paused accounts are excluded from discovery and new contact", () => {
  assert.match(migration, /p\.inactive_mode = false/);
  assert.match(migration, /create trigger introductions_inactive_guard/);
  assert.match(migration, /create trigger messages_inactive_guard/);
  assert.match(migration, /raise exception 'Conversation unavailable'/);
});

test("failed activity pings are not throttled as if they succeeded", () => {
  assert.match(proxy, /const \{ error: activityError \} = await supabase\.rpc\("touch_activity"\)/);
  assert.match(proxy, /if \(!activityError\) response\.cookies\.set\("activity-ping"/);
});

test("pause suppresses presence and activity earning", () => {
  assert.match(migration, /target\.inactive_mode = false/);
  assert.match(migration, /p\.inactive_mode = false/);
  assert.match(migration, /deactivated_at is not null or inactive_mode/);
  assert.match(presence, /inactive_mode/);
  assert.match(presence, /ownSettingsRef\.current\.inactive_mode/);
  assert.match(presence, /select\("availability,show_activity_status,inactive_mode"\)/);
});

test("pause freezes rank state and resume recalculates from the frozen score", () => {
  assert.match(migration, /if profile_row\.inactive_mode then/);
  assert.match(migration, /is_frozen = true/);
  assert.match(migration, /frozen_score = coalesce\(frozen_score, current_score\)/);
  assert.match(migration, /if state_row\.is_frozen then/);
  assert.match(migration, /last_resumed_at = now\(\)/);
  assert.match(migration, /frozen_score = null/);
});

test("public profiles expose only the rank label and flavor, while admins get raw metrics", () => {
  assert.match(migration, /'activity_rank', coalesce\(rank_json ->> 'name', 'Passing Notes'\)/);
  assert.match(migration, /'activity_rank_flavor', rank_json ->> 'flavor'/);
  assert.doesNotMatch(migration.slice(migration.indexOf("create or replace function public.get_public_profile")), /'current_score'/);
  assert.match(migration, /if not public\.is_admin\(\) then raise exception 'Administrator authorization required'/);
  assert.match(migration, /admin_get_activity_rank_metrics\(target_user uuid\)[\s\S]*?language plpgsql\s+volatile/);
  assert.match(migration, /'frozen_score', s\.frozen_score/);
  assert.match(adminUser, /admin_get_activity_rank_metrics/);
  assert.match(profileView, /profile\.activity_rank/);
});

test("presence UI immediately stops or restarts publication when settings change", () => {
  assert.match(presence, /document\.addEventListener\("submit", onSettingsSubmit, true\)/);
  assert.match(presence, /await ownChannel\.untrack\(\)/);
  assert.match(presence, /await trackOwn\(\)/);
  assert.match(presence, /name=|inactive_mode/);
});
