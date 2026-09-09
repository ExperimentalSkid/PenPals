import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20260903040000_account_deactivation_authority.sql", root), "utf8");
const adminSelfDeactivationGuard = await readFile(new URL("supabase/migrations/20260904230000_prevent_admin_self_deactivation.sql", root), "utf8");
const layout = await readFile(new URL("src/app/app/layout.tsx", root), "utf8");
const proxy = await readFile(new URL("src/lib/supabase/proxy.ts", root), "utf8");
const action = await readFile(new URL("src/app/app/profile/actions.ts", root), "utf8");
const reactivationRoute = await readFile(new URL("src/app/reactivate/page.tsx", root), "utf8");

test("deactivated_at and its administrator marker are database-authoritative", () => {
  assert.match(migration, /add column if not exists admin_deactivated_at timestamptz/i);
  assert.match(migration, /profiles_account_deactivation_guard/);
  assert.match(migration, /Account status changes require the protected account status action/);
  assert.match(migration, /current_setting\('app\.allow_account_status_change', true\)/);
  assert.match(migration, /revoke all on function public\.protect_account_deactivation\(\) from public, anon, authenticated/);
});

test("self RPCs cannot undo an administrator-owned deactivation", () => {
  assert.match(migration, /admin_deactivated_at is not null/);
  assert.match(migration, /Account status is controlled by an administrator/);
  assert.match(migration, /where id = auth\.uid\(\) and deactivated_at is not null and admin_deactivated_at is null/);
  assert.match(migration, /admin_deactivated_at = now\(\)/);
  assert.match(migration, /admin_deactivated_at = null/);
});

test("administrator status changes remain authorized and audited", () => {
  assert.match(migration, /if not public\.is_admin\(\)/);
  assert.match(migration, /A moderation reason is required/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /moderation_audit_log/);
  assert.match(migration, /grant execute on function public\.admin_set_account_status\(uuid, boolean, text\) to authenticated/);
});

test("administrator accounts cannot self-deactivate through the protected RPC", () => {
  assert.match(adminSelfDeactivationGuard, /create or replace function public\.deactivate_account\(\)/);
  assert.match(adminSelfDeactivationGuard, /role = 'admin'/);
  assert.match(adminSelfDeactivationGuard, /Administrator accounts cannot self-deactivate/);
  assert.match(adminSelfDeactivationGuard, /revoke all on function public\.deactivate_account\(\)/);
});

test("every app route rejects a deactivated profile before rendering app data", () => {
  assert.match(layout, /force-dynamic/);
  assert.match(layout, /select\("username,display_name,role,deactivated_at"\)/);
  assert.match(layout, /if \(p\?\.deactivated_at\) redirect\("\/reactivate"\)/);
  assert.match(layout, /unread_notification_count/);
  assert.match(proxy, /select\("deactivated_at"\)/);
  assert.match(proxy, /lifecycleProfile\?\.deactivated_at\) return withSessionCookies\(NextResponse\.redirect\(new URL\("\/reactivate", request\.url\)\)\)/);
});

test("the existing self-reactivation path remains available outside /app", () => {
  assert.match(reactivationRoute, /reactivateAccount/);
  assert.match(reactivationRoute, /select\("deactivated_at"\)/);
  assert.match(action, /redirect\(`\/reactivate\?error=/);
  assert.match(action, /redirect\("\/app\/profile\/setup"\)/);
});

const hasLocalDatabase = (() => {
  try {
    execFileSync("docker", ["inspect", "supabase_db_Penpal"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

test("live database guard blocks direct updates and affected-user reactivation", { skip: !hasLocalDatabase }, () => {
  // Create the subject in the transaction rather than assuming old, manually
  // seeded UUIDs still exist. The test must exercise an actual profile row:
  // UPDATE zero rows would otherwise make the sentinel look like a bypass.
  const sql = String.raw`
begin;
do $$
declare
  target_user uuid := gen_random_uuid();
  admin_user uuid := gen_random_uuid();
  fixture_prefix text := 'd' || left(replace(target_user::text, '-', ''), 14);
begin
  insert into auth.users(id, email, email_confirmed_at)
    values (target_user, target_user::text || '@example.test', now()),
           (admin_user, admin_user::text || '@example.test', now());
  insert into public.profiles(
    id, username, display_name, birth_date, gender, country, country_code,
    city, location_precision, bio, quote, looking_for
  ) values (
    target_user, fixture_prefix || '_t', 'Deactivation Fixture', '1990-01-01',
    'Not specified', 'NO', 'NO', '', 'country', 'Fixture bio.',
    'Fixture quote.', 'friendship'
  ), (
    admin_user, fixture_prefix || '_a', 'Deactivation Admin', '1990-01-01',
    'Not specified', 'NO', 'NO', '', 'country', 'Fixture admin bio.',
    'Fixture admin quote.', 'friendship'
  );
  perform set_config('app.allow_role_change', '1', true);
  update public.profiles set role = 'admin' where id = admin_user;

  perform set_config('request.jwt.claim.sub', target_user::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  begin
    update public.profiles set deactivated_at = now() where id = auth.uid();
    raise exception 'direct profile UPDATE unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'direct profile UPDATE unexpectedly succeeded' then raise; end if;
    if sqlerrm not like '%Account status changes require the protected account status action%' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', admin_user::text, true);
  perform public.admin_set_account_status(target_user, true, 'QA authority check');

  perform set_config('request.jwt.claim.sub', target_user::text, true);
  begin
    perform public.reactivate_account();
    raise exception 'affected user unexpectedly reactivated';
  exception when others then
    if sqlerrm = 'affected user unexpectedly reactivated' then raise; end if;
    if sqlerrm not like '%Account status is controlled by an administrator%' then raise; end if;
  end;
  begin
    perform public.admin_set_account_status(target_user, false, 'bypass');
    raise exception 'normal user unexpectedly changed account status';
  exception when others then
    if sqlerrm = 'normal user unexpectedly changed account status' then raise; end if;
    if sqlerrm not like '%Administrator authorization required%' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', admin_user::text, true);
  perform public.admin_set_account_status(target_user, false, 'QA restore check');
end;
$$;
rollback;
`;
  execFileSync("docker", ["exec", "-i", "supabase_db_Penpal", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" });
});
