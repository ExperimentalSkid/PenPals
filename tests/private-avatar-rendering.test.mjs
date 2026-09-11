import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const avatarHelper = await readFile(new URL("src/lib/avatar.ts", root), "utf8");
const profileView = await readFile(new URL("src/app/app/profile/[username]/ProfileView.tsx", root), "utf8");
const profilePage = await readFile(new URL("src/app/app/profile/[username]/page.tsx", root), "utf8");
const conversation = await readFile(new URL("src/app/app/messages/[id]/page.tsx", root), "utf8");
const privateAvatarServer = await readFile(new URL("src/lib/private-avatar-server.ts", root), "utf8");

test("signed Supabase avatars bypass Next optimization and legacy external URLs are rejected", () => {
  assert.match(avatarHelper, /\/storage\/v1\/object\/sign\/avatars\//);
  assert.match(avatarHelper, /isPrivateAvatarPath/);
  assert.match(profileView, /unoptimized=\{isSignedAvatarUrl\(photo\)\}/);
  assert.match(conversation, /unoptimized=\{isSignedAvatarUrl\(photoUrl\)\}/);
  assert.match(avatarHelper, /Legacy external URLs intentionally return false/);
  assert.doesNotMatch(avatarHelper, /return path;/);
});

test("private avatar consumers still obtain short-lived signed URLs", () => {
  assert.match(profilePage, /getAuthorizedProfilePhoto\(db, targetId, auth\.claims\.sub\)/);
  assert.match(conversation, /getAuthorizedProfilePhoto\(db, targetId, uid\)/);
  assert.match(privateAvatarServer, /can_view_profile_photo/);
  assert.match(privateAvatarServer, /createSignedUrl\(avatarPath, 3600\)/);
  assert.match(privateAvatarServer, /SUPABASE_SERVICE_ROLE_KEY/);
});
