import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const page = await read("src/app/app/messages/[id]/page.tsx");
const actions = await read("src/app/app/messages/actions.ts");
const avatar = await read("src/lib/avatar.ts");
const privateAvatarServer = await read("src/lib/private-avatar-server.ts");
const latestPhotoRules = await read("supabase/migrations/20260902220000_require_verified_email.sql");

test("private-photo conversation wiring covers request, cooldown, proactive share, and revoke", () => {
  assert.match(page, /requestPhotoAccess/);
  assert.match(page, /select\("id,requester_id,owner_id,status,created_at,updated_at"\)/);
  assert.match(page, /PHOTO_REQUEST_COOLDOWN_MS = 72 \* 60 \* 60 \* 1000/);
  assert.match(page, /photoCooldownActive/);
  assert.match(page, /app\.messages\.photoDeclined/);
  assert.match(page, /!photoCooldown && <form action=\{requestPhotoAccess\}/);
  assert.match(page, /pairBlockResult\.error/);
  assert.match(page, /ownPhotoAvailable/);
  assert.match(page, /app\.messages\.addPhoto/);
  assert.match(page, /grantPhotoAccess/);
  assert.match(page, /revokePhotoAccess/);
  assert.match(page, /app\.messages\.photoGrantedTo/);
  assert.match(page, /pendingTheirs\.length > 0/);
  assert.match(page, /form action=\{respondPhotoAccess\}/);
  assert.doesNotMatch(page, /pendingRequests=/);
});

test("private-photo request responses remain owner-controlled and block-aware", () => {
  assert.match(page, /respondPhotoAccess/);
  assert.match(page, /decision.*allowed/);
  assert.match(page, /decision.*declined/);
  assert.match(page, /users_are_blocked/);
  assert.match(page, /app\.messages\.photoUnavailable/);
  assert.match(latestPhotoRules, /request_photo_access[\s\S]*updated_at > now\(\) - interval '72 hours'/);
  assert.match(latestPhotoRules, /respond_photo_access[\s\S]*r\.owner_id <> auth\.uid\(\)/);
  assert.match(latestPhotoRules, /revoke_photo_access[\s\S]*owner_id = auth\.uid\(\)/);
});

test("photo server actions preserve error feedback instead of treating failures as grants", () => {
  assert.match(actions, /request_photo_access/);
  assert.match(actions, /server\.messages\.photoUnavailable/);
  assert.match(actions, /grant_photo_access/);
  assert.match(actions, /if \(error\) redirect\(`\/app\/messages\/\$\{conversationId\}\?error=/);
  assert.match(actions, /respond_photo_access/);
  assert.match(actions, /revoke_photo_access/);
  assert.match(actions, /server\.messages\.photoRevokeFailed/);
});

test("signed avatar rendering remains private-path and short-lived", () => {
  assert.match(page, /getAuthorizedProfilePhoto\(db, targetId, uid\)/);
  assert.match(privateAvatarServer, /can_view_profile_photo/);
  assert.match(privateAvatarServer, /isPrivateAvatarPath\(avatarPath, ownerUser\)/);
  assert.match(privateAvatarServer, /createSignedUrl\(avatarPath, 3600\)/);
  assert.match(page, /unoptimized=\{isSignedAvatarUrl\(photoUrl\)\}/);
  assert.match(avatar, /Legacy external URLs intentionally return false/);
});
