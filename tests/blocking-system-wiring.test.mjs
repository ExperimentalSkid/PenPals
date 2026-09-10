import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const visibility = await read("supabase/migrations/20260901110000_add_privacy_notifications_accounts.sql");
const discoverPage = await read("supabase/migrations/20260903200000_add_discover_card_location.sql");
const messageGuard = await read("supabase/migrations/20260902213000_fix_blocked_message_insert_rls.sql");
const introductionAcceptance = await read("supabase/migrations/20260904070000_wire_introduction_acceptance.sql");
const snailMail = await read("supabase/migrations/20260903180000_cancel_snail_mail.sql");
const photoAccess = await read("supabase/migrations/20260903133000_preserve_owner_avatar_storage_access.sql");
const activityAndPresence = await read("supabase/migrations/20260903000000_activity_ranks_and_inactive_mode.sql");
const presenceAuthorization = await read("supabase/migrations/20260902220000_require_verified_email.sql");
const page = await read("src/app/app/messages/[id]/page.tsx");
const thread = await read("src/app/app/messages/[id]/ConversationThread.tsx");
const snailPanel = await read("src/app/app/messages/[id]/SnailMailPanel.tsx");
const notifications = await read("src/app/app/notifications/page.tsx");
const profilePage = await read("src/app/app/profile/[username]/page.tsx");

test("profile, Discover, and identity lookups use symmetric block-aware privacy", () => {
  assert.match(visibility, /blocker_id = auth\.uid\(\) and b\.blocked_id = target/i);
  assert.match(visibility, /b\.blocker_id = target and b\.blocked_id = auth\.uid\(\)/i);
  assert.match(discoverPage, /viewer_can_access_profile\(p\.id\)/i);
  assert.match(activityAndPresence, /create or replace function public\.resolve_profile_identity/i);
  assert.match(activityAndPresence, /viewer_can_access_profile\(p\.id\)/i);
  assert.match(profilePage, /if \(!profile\) notFound\(\)/i);
});

test("introduction, instant messaging, and Snail Mail enforce blocks in either direction", () => {
  assert.match(introductionAcceptance, /blocker_id = me and blocked_id = intro\.sender_id/i);
  assert.match(introductionAcceptance, /blocker_id = intro\.sender_id and blocked_id = me/i);
  assert.match(messageGuard, /b\.blocker_id = first_user/i);
  assert.match(messageGuard, /b\.blocker_id = second_user/i);
  assert.match(messageGuard, /public\.users_are_blocked\(auth\.uid\(\), p\.user_id\)/i);
  assert.match(snailMail, /b\.blocker_id = me and b\.blocked_id = other_user/i);
  assert.match(snailMail, /b\.blocker_id = other_user and b\.blocked_id = me/i);
});

test("photo access and presence stay unavailable across either-direction blocks", () => {
  assert.match(photoAccess, /b\.blocker_id = owner_user and b\.blocked_id = auth\.uid\(\)/i);
  assert.match(photoAccess, /b\.blocker_id = auth\.uid\(\) and b\.blocked_id = owner_user/i);
  assert.match(presenceAuthorization, /create or replace function public\.realtime_presence_viewer/i);
  assert.match(presenceAuthorization, /b\.blocker_id = auth\.uid\(\).*b\.blocked_id/s);
  assert.match(presenceAuthorization, /b\.blocked_id = auth\.uid\(\).*b\.blocker_id/s);
  assert.match(activityAndPresence, /b\.blocker_id = auth\.uid\(\).*b\.blocked_id/s);
  assert.match(activityAndPresence, /b\.blocked_id = auth\.uid\(\).*b\.blocker_id/s);
});

test("conversation UI detects a block created by either participant and fails closed", () => {
  assert.match(page, /rpc\("users_are_blocked",\s*\{ first_user: uid, second_user: targetId \}\)/s);
  assert.match(page, /const pairBlocked = Boolean\(pairBlockResult\.data\)/);
  assert.match(page, /const pairBlockStateUnavailable = Boolean\(pairBlockResult\.error\)/);
  assert.match(page, /BlockControl blocked=\{blockedByMe\}/);
  assert.match(page, /messageSendBlocked=\{pairBlocked \|\| pairBlockStateUnavailable \|\| messageStreak >= 3\}/);
  assert.match(page, /pendingRequests=\{pairBlocked \|\| photoStateError \? \[\] : pendingTheirs\}/);
  assert.match(page, /Snail Mail is unavailable because one of you blocked the other\./);
  assert.match(page, /app\.messages\.photoUnavailable/);
  assert.match(thread, /messageSendBlockedReason\?/);
  assert.match(thread, /disabled=\{messageSendBlocked\}/);
  assert.match(thread, /blockedReason/);
  assert.match(snailPanel, /composeBlockedReason/);
});

test("notifications keep their owner-only read path and hide blocked actors through identity resolution", () => {
  assert.match(notifications, /\.eq\("user_id", uid\)/);
  assert.match(notifications, /resolve_profile_identity/);
  assert.match(notifications, /app\.notifications\.deletedUser/);
  assert.match(notifications, /can_view_profile_photo/);
});

test("blocked-user settings surfaces read failures instead of a false empty state", async () => {
  const blockedPage = await readFile(new URL("../src/app/app/settings/blocked/page.tsx", import.meta.url), "utf8");
  assert.match(blockedPage, /error:\s*blockedError/);
  assert.match(blockedPage, /app\.settings\.blockedLoadError/);
  assert.match(blockedPage, /!blockedError && !rows\?\.length/);
});
