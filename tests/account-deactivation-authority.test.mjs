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
  assert.match(proxy, /profile\?\.deactivated_at\) return NextResponse\.redirect\(new URL\("\/reactivate"/);
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
  const sql = `begin;
select set_config('request.jwt.claim.sub','7ede9653-34bf-4de4-a69b-184a6c35c0f0',true);
select set_config('request.jwt.claim.role','authenticated',true);
do $$
begin
  begin
    update public.profiles set deactivated_at = now() where id = auth.uid();
    raise exception 'direct profile UPDATE unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'direct profile UPDATE unexpectedly succeeded' then raise; end if;
  end;
end
$$;
select set_config('request.jwt.claim.sub','21621151-e65d-4dda-a2ad-de562756df61',true);
select public.admin_set_account_status('7ede9653-34bf-4de4-a69b-184a6c35c0f0', true, 'QA authority check');
select set_config('request.jwt.claim.sub','7ede9653-34bf-4de4-a69b-184a6c35c0f0',true);
do $$
begin
  begin
    perform public.reactivate_account();
    raise exception 'affected user unexpectedly reactivated';
  exception when others then
    if sqlerrm = 'affected user unexpectedly reactivated' then raise; end if;
  end;
end
$$;
do $$
begin
  begin
    perform public.admin_set_account_status('7ede9653-34bf-4de4-a69b-184a6c35c0f0', false, 'bypass');
    raise exception 'normal user unexpectedly changed account status';
  exception when others then
    if sqlerrm = 'normal user unexpectedly changed account status' then raise; end if;
  end;
end
$$;
select set_config('request.jwt.claim.sub','21621151-e65d-4dda-a2ad-de562756df61',true);
select public.admin_set_account_status('7ede9653-34bf-4de4-a69b-184a6c35c0f0', false, 'QA restore check');
rollback;`;
  execFileSync("docker", ["exec", "-i", "supabase_db_Penpal", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" });
});
