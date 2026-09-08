import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const files = {
  migration: await read("supabase/migrations/20260902240000_external_verification_admin_audit.sql"),
  revokeMigration: await read("supabase/migrations/20260902240100_external_verification_revoke_status.sql"),
  userDetail: await read("src/app/app/admin/users/[id]/page.tsx"),
  audit: await read("src/app/app/admin/audit/page.tsx"),
  callback: await read("src/app/auth/verification/[provider]/callback/route.ts"),
};

test("admin verification projection is role-gated and omits raw provider identity", () => {
  assert.match(files.migration, /create or replace function public\.admin_get_user_verification\(target_user uuid\)/);
  assert.match(files.migration, /if not public\.is_admin\(\) then/);
  assert.match(files.migration, /verification_metadata_view/);
  assert.match(files.migration, /'provider', v\.provider/);
  assert.match(files.migration, /'verified_at', v\.verified_at/);
  assert.match(files.migration, /'revoked_at', v\.revoked_at/);
  assert.match(files.migration, /'conflicts'/);
  assert.doesNotMatch(files.migration.slice(files.migration.indexOf("'records'"), files.migration.indexOf("'conflicts'")), /provider_subject_fingerprint|provider_account_created_at|capabilities/);
  assert.match(files.migration, /revoke all on function public\.admin_get_user_verification\(uuid\)[\s\S]*grant execute on function public\.admin_get_user_verification\(uuid\) to authenticated/);
});

test("verification lifecycle and identity reuse attempts are audited", () => {
  assert.match(files.migration, /external_verification_recorded/);
  assert.match(files.migration, /external_verification_revoked/);
  assert.match(files.migration, /external_verification_conflict/);
  assert.match(files.migration, /conflict_role/);
  assert.match(files.callback, /record_external_verification_conflict/);
  assert.match(files.callback, /already linked/);
  assert.match(files.migration, /set search_path = pg_catalog, public/);
  assert.match(files.revokeMigration, /select v\.status into old_status/);
  assert.match(files.revokeMigration, /old_status,\s*'not_verified'/);
});

test("admin user detail renders the restricted verification context", () => {
  assert.match(files.userDetail, /admin_get_user_verification/);
  assert.match(files.userDetail, /External verification/);
  assert.match(files.userDetail, /Duplicate\/reuse conflicts/);
  assert.match(files.userDetail, /Provider identity data is restricted to administrators/);
});

test("verification audit actions remain admin-only in the audit filter", () => {
  for (const action of ["verification_metadata_view", "external_verification_recorded", "external_verification_revoked", "external_verification_conflict"]) {
    assert.match(files.audit, new RegExp(action));
  }
  // The existing admin_list_audit_entries RPC performs the role filter; this
  // page only exposes the new actions in the existing admin audit selector.
  assert.match(files.audit, /admin_list_audit_entries/);
});
