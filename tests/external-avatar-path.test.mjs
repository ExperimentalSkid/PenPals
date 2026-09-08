import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20260903130000_harden_avatar_path_compatibility.sql", root), "utf8");
const helper = await readFile(new URL("src/lib/avatar.ts", root), "utf8");
const profilePage = await readFile(new URL("src/app/app/profile/[username]/page.tsx", root));
const blockedPage = await readFile(new URL("src/app/app/settings/blocked/page.tsx", root));
const profileActions = await readFile(new URL("src/app/app/profile/actions.ts", root));

const envText = await readFile(new URL(".env.local", root), "utf8").catch(() => "");
function envValue(name) {
  const line = envText.split(/\r?\n/).find((entry) => entry.startsWith(`${name}=`));
  return process.env[name] || line?.slice(name.length + 1).trim() || "";
}
const supabaseUrl = envValue("NEXT_PUBLIC_SUPABASE_URL");
const publishableKey = envValue("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
const hasLocalDatabase = (() => {
  try { execFileSync("docker", ["inspect", "supabase_db_Penpal"], { stdio: "ignore" }); return true; } catch { return false; }
})();

test("legacy avatar values are quarantined, preserved, and rejected by the profile trigger", () => {
  assert.match(migration, /profile_legacy_avatar_paths/);
  assert.match(migration, /not public\.is_private_avatar_path/);
  assert.match(migration, /profiles_avatar_path_guard/);
  assert.match(migration, /Invalid avatar path/);
  assert.match(migration, /public\.is_private_avatar_path\(p\.id,p\.avatar_path\)/);
  assert.match(helper, /Legacy external URLs intentionally return false/);
  assert.match(profilePage.toString(), /isPrivateAvatarPath\(profile\.avatar_path, targetId\)/);
  assert.doesNotMatch(blockedPage.toString(), /profiles\(username,display_name,avatar_path\)/);
  assert.match(profileActions.toString(), /isPrivateAvatarPath\(profile\.avatar_path, uid\)/);
});

test("direct external avatar writes are rejected by the live database", { skip: !hasLocalDatabase || !supabaseUrl || !publishableKey }, async () => {
  const db = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data: signIn, error: signInError } = await db.auth.signInWithPassword({ email: "mika@example.local", password: process.env.PENPAL_LOCAL_TEST_PASSWORD || "demo" });
  assert.equal(signInError, null);
  const userId = signIn.user?.id;
  assert.ok(userId);
  const { data: before, error: beforeError } = await db.from("profiles").select("avatar_path").eq("id", userId).single();
  assert.equal(beforeError, null);
  const { error: writeError } = await db.from("profiles").update({ avatar_path: "https://example.invalid/avatar.jpg" }).eq("id", userId);
  assert.ok(writeError, "external avatar path write unexpectedly succeeded");
  const { data: after, error: afterError } = await db.from("profiles").select("avatar_path").eq("id", userId).single();
  assert.equal(afterError, null);
  assert.equal(after?.avatar_path, before?.avatar_path);
  await db.auth.signOut();

  const viewer = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { error: viewerSignInError } = await viewer.auth.signInWithPassword({ email: "yuna@example.local", password: process.env.PENPAL_LOCAL_TEST_PASSWORD || "demo" });
  assert.equal(viewerSignInError, null);
  const { data: viewerPhotoAllowed, error: viewerPhotoError } = await viewer.rpc("can_view_profile_photo", { owner_user: userId, viewer_user: userId });
  assert.equal(viewerPhotoError, null);
  assert.equal(viewerPhotoAllowed, false, "legacy external avatar was treated as a private photo");
  const { data: publicProfile, error: publicProfileError } = await viewer.rpc("get_public_profile", { target_username: "mika" });
  assert.equal(publicProfileError, null);
  assert.equal(publicProfile?.avatar_path ?? null, null, "legacy external avatar leaked through the public profile projection");
  await viewer.auth.signOut();
});
