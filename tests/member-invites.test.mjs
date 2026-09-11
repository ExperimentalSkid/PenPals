import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("member invites are one-use hashed links with ownership and rate limits", async () => {
  const sql = await read("supabase/migrations/20260911204000_member_invites.sql");
  assert.match(sql, /token_hash text not null unique/);
  assert.match(sql, /extensions\.digest\(raw_token, 'sha256'\)/);
  assert.match(sql, /Invite creation rate limit reached/);
  assert.match(sql, /Too many active invitations/);
  assert.match(sql, /i\.inviter_id <> target_user/);
  assert.match(sql, /revoke_member_invite/);
  assert.match(sql, /auth_users_member_invite_claim/);
  assert.match(sql, /complete_my_member_invite/);
});

test("own profile exposes shareable invite creation without collecting third-party email", async () => {
  const profile = await read("src/app/app/profile/[username]/ProfileView.tsx");
  const component = await read("src/app/app/profile/InviteMember.tsx");
  const action = await read("src/app/app/profile/invite-actions.ts");
  assert.match(profile, /isOwn && <InviteMember/);
  assert.match(component, /navigator\.clipboard\.writeText/);
  assert.match(component, /revokeMemberInvite/);
  assert.match(action, /create_member_invite/);
  assert.match(action, /\/join\//);
  assert.doesNotMatch(component + action, /name="email"|recipient_email|invitee_email/);
});

test("invite landing and signup preserve attribution through email and Google signup", async () => {
  const join = await read("src/app/join/[token]/page.tsx");
  const signup = await read("src/app/sign-up/page.tsx");
  const auth = await read("src/app/auth/actions.ts");
  const google = await read("src/app/auth/GoogleAuthButton.tsx");
  const callback = await read("src/app/auth/callback/route.ts");
  assert.match(join, /open_member_invite/);
  assert.match(join, /\/sign-up\?invite=/);
  assert.match(signup, /member_invite_token/);
  assert.match(auth, /member_invite_token/);
  assert.match(google, /inviteToken/);
  assert.match(callback, /claim_member_invite/);
});
