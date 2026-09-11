import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { LOCAL_DB_CONTAINER } from "./helpers/local-db.mjs";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20260903130000_harden_avatar_path_compatibility.sql", root), "utf8");
const helper = await readFile(new URL("src/lib/avatar.ts", root), "utf8");
const privateAvatarServer = await readFile(new URL("src/lib/private-avatar-server.ts", root), "utf8");
const profilePage = await readFile(new URL("src/app/app/profile/[username]/page.tsx", root));
const blockedPage = await readFile(new URL("src/app/app/settings/blocked/page.tsx", root));
const profileActions = await readFile(new URL("src/app/app/profile/actions.ts", root));

const hasLocalDatabase = (() => {
  try { execFileSync("docker", ["inspect", LOCAL_DB_CONTAINER], { stdio: "ignore" }); return true; } catch { return false; }
})();

test("legacy avatar values are quarantined, preserved, and rejected by the profile trigger", () => {
  assert.match(migration, /profile_legacy_avatar_paths/);
  assert.match(migration, /not public\.is_private_avatar_path/);
  assert.match(migration, /profiles_avatar_path_guard/);
  assert.match(migration, /Invalid avatar path/);
  assert.match(migration, /public\.is_private_avatar_path\(p\.id,p\.avatar_path\)/);
  assert.match(helper, /Legacy external URLs intentionally return false/);
  assert.match(profilePage.toString(), /getAuthorizedProfilePhoto\(db, targetId, auth\.claims\.sub\)/);
  assert.match(privateAvatarServer, /isPrivateAvatarPath\(avatarPath, ownerUser\)/);
  assert.doesNotMatch(blockedPage.toString(), /profiles\(username,display_name,avatar_path\)/);
  assert.match(profileActions.toString(), /isPrivateAvatarPath\(profile\.avatar_path, uid\)/);
});

test("direct external avatar writes are rejected by the live database", { skip: !hasLocalDatabase }, () => {
  const sql = String.raw`
begin;
do $$
declare
  owner_user uuid := gen_random_uuid();
  viewer_user uuid := gen_random_uuid();
  owner_username text := 'avatar_' || left(replace(gen_random_uuid()::text, '-', ''), 12);
  before_path text;
  after_path text;
  public_row jsonb;
  allowed boolean;
begin
  insert into auth.users(id,email,email_confirmed_at)
    values (owner_user, owner_user::text || '@example.test', now()),
           (viewer_user, viewer_user::text || '@example.test', now());
  insert into public.profiles(id,username,display_name,birth_date,gender,country,country_code,city,location_precision,bio,quote,looking_for,avatar_path)
    values
      (owner_user, owner_username, 'Avatar Owner', date '1990-01-01', 'Not specified', 'NO', 'NO', '', 'country', 'Fixture owner bio.', 'Fixture quote.', 'friendship', null),
      (viewer_user, 'viewer_' || left(viewer_user::text, 8), 'Avatar Viewer', date '1990-01-01', 'Not specified', 'SE', 'SE', '', 'country', 'Fixture viewer bio.', 'Fixture quote.', 'friendship', null);

  select avatar_path into before_path from public.profiles where id = owner_user;
  perform set_config('request.jwt.claim.sub', owner_user::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  begin
    update public.profiles set avatar_path = 'https://example.invalid/avatar.jpg' where id = owner_user;
    raise exception 'external avatar path write unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'external avatar path write unexpectedly succeeded' then raise; end if;
  end;
  reset role;
  select avatar_path into after_path from public.profiles where id = owner_user;
  if after_path is distinct from before_path then raise exception 'rejected avatar write changed stored path'; end if;

  perform set_config('request.jwt.claim.sub', viewer_user::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  select public.can_view_profile_photo(owner_user, viewer_user) into allowed;
  if allowed then raise exception 'external/absent avatar treated as private photo'; end if;
  select public.get_public_profile(owner_username) into public_row;
  if coalesce(public_row->>'avatar_path', '') <> '' then raise exception 'avatar path leaked through public projection'; end if;
end;
$$;
rollback;`;
  execFileSync("docker", ["exec", "-i", LOCAL_DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: sql, stdio: ["pipe", "ignore", "pipe"] });
});
