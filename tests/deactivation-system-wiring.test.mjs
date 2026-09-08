import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const authorityMigration = await readFile(new URL("supabase/migrations/20260903040000_account_deactivation_authority.sql", root), "utf8");
const reactivationMigration = await readFile(new URL("supabase/migrations/20260904100000_restore_admin_reactivation_preferences.sql", root), "utf8");
const overrideMigration = await readFile(new URL("supabase/migrations/20260904120000_clear_account_status_override.sql", root), "utf8");
const profileGuardMigration = await readFile(new URL("supabase/migrations/20260904110000_block_deactivated_profile_mutations.sql", root), "utf8");
const layout = await readFile(new URL("src/app/app/layout.tsx", root), "utf8");
const proxy = await readFile(new URL("src/lib/supabase/proxy.ts", root), "utf8");
const adminGuard = await readFile(new URL("src/app/app/admin/guard.ts", root), "utf8");
const callback = await readFile(new URL("src/app/auth/callback/route.ts", root), "utf8");
const introductionMigration = await readFile(new URL("supabase/migrations/20260902220000_require_verified_email.sql", root), "utf8");
const snailMailMigration = await readFile(new URL("supabase/migrations/20260903020000_snail_mail.sql", root), "utf8");
const photoMigration = await readFile(new URL("supabase/migrations/20260902100000_photo_access_cooldown_and_grant.sql", root), "utf8");
const messageMigration = await readFile(new URL("supabase/migrations/20260902213000_fix_blocked_message_insert_rls.sql", root), "utf8");

test("deactivation is distinct, authoritative, and enforced at every app boundary", () => {
  assert.match(authorityMigration, /profiles_account_deactivation_guard/);
  assert.match(authorityMigration, /admin_deactivated_at/);
  assert.match(authorityMigration, /Account status changes require the protected account status action/);
  assert.match(layout, /if \(p\?\.deactivated_at\) redirect\("\/reactivate"\)/);
  assert.match(proxy, /profile\?\.deactivated_at\) return NextResponse\.redirect\(new URL\("\/reactivate"/);
  assert.match(adminGuard, /profile\?\.deactivated_at/);
  assert.match(callback, /if \(profile\?\.deactivated_at\) return destination\(request, "\/reactivate"/);
});

test("deactivation blocks contact and photo establishment paths without changing pause", () => {
  assert.match(introductionMigration, /exists \(select 1 from public\.profiles where id = me and deactivated_at is not null\)/);
  assert.match(introductionMigration, /where id = other_user and deactivated_at is null/);
  assert.match(messageMigration, /deactivated_at is not null/);
  assert.match(snailMailMigration, /sender_profile\.deactivated_at is not null/);
  assert.match(snailMailMigration, /recipient_profile\.deactivated_at is not null/);
  assert.match(photoMigration, /id in \(me, owner_user\) and deactivated_at is not null/);
  assert.match(photoMigration, /id in \(me, viewer_user\) and deactivated_at is not null/);
  assert.doesNotMatch(reactivationMigration, /inactive_mode\s*=/i);
  assert.doesNotMatch(profileGuardMigration, /inactive_mode\s*=/i);
});

test("administrator reactivation restores the target's pre-deactivation contact preference", () => {
  assert.match(reactivationMigration, /accepting_new_conversations_before_deactivation = accepting_new_conversations/);
  assert.match(reactivationMigration, /accepting_new_conversations = coalesce\(accepting_new_conversations_before_deactivation, accepting_new_conversations\)/);
  assert.match(reactivationMigration, /accepting_new_conversations_before_deactivation = null/);
  assert.match(reactivationMigration, /moderation_audit_log/);
  assert.match(profileGuardMigration, /old\.deactivated_at is not null/);
  assert.match(profileGuardMigration, /auth\.uid\(\) = old\.id/);
  assert.match(profileGuardMigration, /app\.allow_account_status_change/);
  assert.match(overrideMigration, /set_config\('app\.allow_account_status_change', '', true\)/);
});

const hasLocalDatabase = (() => {
  try {
    execFileSync("docker", ["inspect", "supabase_db_Penpal"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

test("live deactivation denies direct contact bypasses and restores admin-managed state", { skip: !hasLocalDatabase }, () => {
  const sql = String.raw`
begin;
do $$
declare
  admin_user uuid;
  target_user uuid;
  target_username text;
  target_display_name text;
  restored_accepting boolean;
  restored_deactivated timestamptz;
  restored_admin_marker timestamptz;
  visible_profile jsonb;
  discover_has_target boolean;
  intro_body text := 'A genuine introduction with enough thoughtful words to satisfy the normal profile conversation validation rules.';
begin
  select p.id into admin_user
    from public.profiles p
   where p.role = 'admin'
     and p.deactivated_at is null
     and exists (select 1 from auth.users u where u.id = p.id and u.email_confirmed_at is not null)
   order by p.created_at
   limit 1;
  select p.id, p.username, p.display_name into target_user, target_username, target_display_name
    from public.profiles p
   where p.role = 'user'
     and p.deactivated_at is null
     and not p.inactive_mode
     and exists (select 1 from auth.users u where u.id = p.id and u.email_confirmed_at is not null)
   order by p.created_at
   limit 1;
  if admin_user is null or target_user is null then raise exception 'verified admin and target fixtures unavailable'; end if;

  -- Establish a deliberately closed pre-deactivation preference inside this
  -- rollback-only transaction so admin reactivation must restore it.
  -- Set a verified administrator identity before the fixture write because
  -- the repository's profile-write trigger applies the same email gate to
  -- direct SQL/API updates.
  perform set_config('request.jwt.claim.sub', admin_user::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  update public.profiles set accepting_new_conversations = false where id = target_user;

  perform public.admin_set_account_status(target_user, true, 'PASS 13 deactivation wiring');

  select p.deactivated_at, p.admin_deactivated_at, p.accepting_new_conversations
    into restored_deactivated, restored_admin_marker, restored_accepting
    from public.profiles p where p.id = target_user;
  if restored_deactivated is null or restored_admin_marker is null or restored_accepting then
    raise exception 'administrator deactivation did not close the account';
  end if;

  perform set_config('request.jwt.claim.sub', target_user::text, true);
  begin
    perform public.reactivate_account();
    raise exception 'affected user bypassed administrator deactivation';
  exception when others then
    if sqlerrm = 'affected user bypassed administrator deactivation' then raise; end if;
  end;
  begin
    update public.profiles set display_name = target_display_name where id = target_user;
    raise exception 'deactivated user changed profile directly';
  exception when others then
    if sqlerrm = 'deactivated user changed profile directly' then raise; end if;
  end;
  begin
    update public.profiles set deactivated_at = null where id = target_user;
    raise exception 'deactivated user cleared status directly';
  exception when others then
    if sqlerrm = 'deactivated user cleared status directly' then raise; end if;
  end;
  begin
    perform public.submit_introduction(admin_user, intro_body);
    raise exception 'deactivated user submitted an introduction';
  exception when others then
    if sqlerrm = 'deactivated user submitted an introduction' then raise; end if;
  end;
  begin
    perform public.send_snail_mail(gen_random_uuid(), 'A letter that must not be sent while this account is deactivated.');
    raise exception 'deactivated user sent Snail Mail';
  exception when others then
    if sqlerrm = 'deactivated user sent Snail Mail' then raise; end if;
  end;
  begin
    perform public.request_photo_access(admin_user, gen_random_uuid());
    raise exception 'deactivated user requested photo access';
  exception when others then
    if sqlerrm = 'deactivated user requested photo access' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', admin_user::text, true);
  select public.get_public_profile(target_username) into visible_profile;
  if visible_profile is not null then raise exception 'deactivated profile remained publicly visible'; end if;
  select exists (select 1 from public.get_discover_profiles() d where d.id = target_user) into discover_has_target;
  if discover_has_target then raise exception 'deactivated profile remained in Discover'; end if;

  perform public.admin_set_account_status(target_user, false, 'PASS 13 restore wiring');
  select p.deactivated_at, p.admin_deactivated_at, p.accepting_new_conversations
    into restored_deactivated, restored_admin_marker, restored_accepting
    from public.profiles p where p.id = target_user;
  if restored_deactivated is not null or restored_admin_marker is not null or restored_accepting then
    raise exception 'administrator reactivation did not restore the prior contact preference';
  end if;
end;
$$;
rollback;
`;
  execFileSync("docker", ["exec", "-i", "supabase_db_Penpal", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: sql, stdio: ["pipe", "ignore", "pipe"] });
});
