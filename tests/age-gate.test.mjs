import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../supabase/migrations/20260902180000_age_gate_and_appeals.sql", import.meta.url), "utf8");
const cooldownFix = await readFile(new URL("../supabase/migrations/20260902181000_fix_profile_age_gate_attempts.sql", import.meta.url), "utf8");
const adminLock = await readFile(new URL("../supabase/migrations/20260902181100_lock_age_appeal_admin_rpc.sql", import.meta.url), "utf8");
const boundaryFix = await readFile(new URL("../supabase/migrations/20260902182400_do_not_restrict_future_dob.sql", import.meta.url), "utf8");
const restrictedSaveFix = await readFile(new URL("../supabase/migrations/20260902205000_block_restricted_profile_save_bypass.sql", import.meta.url), "utf8");
const signupAction = await readFile(new URL("../src/app/auth/actions.ts", import.meta.url), "utf8");
const signupPage = await readFile(new URL("../src/app/sign-up/page.tsx", import.meta.url), "utf8");
const profileActions = await readFile(new URL("../src/app/app/profile/actions.ts", import.meta.url), "utf8");
const profileSetup = await readFile(new URL("../src/app/app/profile/setup/page.tsx", import.meta.url), "utf8");
const appealPage = await readFile(new URL("../src/app/age-appeal/page.tsx", import.meta.url), "utf8");
const appealAction = await readFile(new URL("../src/app/age-appeal/actions.ts", import.meta.url), "utf8");
const adminPage = await readFile(new URL("../src/app/app/admin/age-appeals/page.tsx", import.meta.url), "utf8");
const adminDecision = await readFile(new URL("../src/app/app/admin/age-appeals/AgeAppealDecision.tsx", import.meta.url), "utf8");
const adminAction = await readFile(new URL("../src/app/app/admin/age-appeals/actions.ts", import.meta.url), "utf8");
const contactHardening = await readFile(new URL("../supabase/migrations/20260902182000_block_underage_contact_paths.sql", import.meta.url), "utf8");

function ageOn(date, today) {
  const birth = new Date(`${date}T00:00:00Z`);
  const now = new Date(`${today}T00:00:00Z`);
  let years = now.getUTCFullYear() - birth.getUTCFullYear();
  if (now.getUTCMonth() < birth.getUTCMonth() || (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate())) years -= 1;
  return years;
}

test("18+ boundary accepts exactly 18 and rejects 17", () => {
  assert.equal(ageOn("2008-09-02", "2026-09-02"), 18);
  assert.equal(ageOn("2009-09-02", "2026-09-02"), 17);
  assert.match(migration, /p_birth_date <= \(current_date - interval '18 years'\)::date/);
});

test("future DOB and direct profile writes are rejected server-side", () => {
  assert.match(migration, /before insert or update of birth_date on public\.profiles/);
  assert.match(migration, /You must be at least 18 years old to use Penpal/);
  assert.match(migration, /not public\.is_adult_birth_date\(p_birth_date\)/);
  assert.match(boundaryFix, /p_birth_date >= current_date then return 'underage'/);
  assert.match(boundaryFix, /if email_verified then/);
});

test("verified underage submissions create a protected restriction until the 18th birthday", () => {
  assert.match(migration, /email_confirmed_at is not null/);
  assert.match(migration, /age_restrictions/);
  assert.match(migration, /normalized_email_hash/);
  assert.match(migration, /\(p_birth_date \+ interval '18 years'\)::date/);
  assert.match(migration, /reason, source, appeal_status/);
  assert.match(migration, /if email_verified then/);
  assert.match(migration, /return 'restricted'/);
});

test("unverified underage attempts do not create a long-term restriction", () => {
  const branch = migration.slice(migration.indexOf("if not public.is_adult_birth_date(p_birth_date)"));
  assert.match(branch, /if email_verified then/);
  assert.match(branch, /return 'underage'/);
  assert.doesNotMatch(branch.slice(branch.indexOf("end if;\n    return 'underage'")), /insert into public\.age_restrictions/);
});

test("signup retries use a separate 48-hour cooldown", () => {
  assert.match(migration, /age_gate_cooldowns/);
  assert.match(migration, /interval '48 hours'/);
  assert.match(migration, /next_attempts >= 3/);
  assert.match(signupAction, /age_gate_signup/);
  assert.match(signupAction, /server\.auth\.restricted/);
  assert.match(signupAction, /server\.auth\.cooldown/);
  assert.match(signupPage, /name="birth_date" type="date"/);
  assert.match(cooldownFix, /Profile edits are not signup attempts/);
});

test("age restrictions are not readable through normal tables or anonymous admin RPCs", () => {
  for (const table of ["age_restrictions", "age_gate_cooldowns", "age_appeals"]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`));
  }
  assert.match(adminLock, /if not public\.is_admin\(\) then raise exception/);
  assert.match(adminLock, /grant execute on function public\.admin_list_age_appeals\(text\) to authenticated/);
});

test("correction appeal is authenticated, validated, rate-limited, and audited", () => {
  assert.match(appealAction, /submit_age_appeal/);
  assert.match(migration, /create or replace function public\.submit_age_appeal/);
  assert.match(migration, /email_verified/);
  assert.match(migration, /submitted_at > now\(\) - interval '48 hours'/);
  assert.match(migration, /age_appeals_one_pending_idx/);
  assert.match(migration, /create or replace function public\.admin_review_age_appeal/);
  assert.match(migration, /admin_review_age_appeal/);
  assert.match(migration, /age_appeal_approved/);
  assert.match(migration, /age_appeal_rejected/);
  assert.match(migration, /moderation_audit_log/);
  assert.match(adminDecision, /Approve correction/);
  assert.match(adminDecision, /Reject correction/);
  assert.match(adminAction, /requireAdmin/);
  assert.match(appealPage, /auth\.age\.submit/);
});

test("approved appeal clears restriction/cooldown without creating an account", () => {
  const approval = migration.slice(migration.indexOf("if decision = 'approved' then"));
  assert.match(approval, /delete from public\.age_gate_cooldowns/);
  assert.match(approval, /delete from public\.age_restrictions/);
  assert.match(approval, /delete from auth\.users/);
  assert.match(migration, /reviewed_by = me/);
});

test("underage users cannot become discoverable or contactable", () => {
  assert.match(migration, /public\.is_adult_birth_date\(p\.birth_date\)/);
  assert.match(migration, /public\.is_adult_birth_date\(birth_date\)/);
  assert.match(migration, /not public\.is_adult_birth_date\(\(select birth_date from public\.profiles where id = me\)\)/);
  assert.match(migration, /p\.deactivated_at is null/);
  assert.match(contactHardening, /create policy "Participants send active adult unblocked messages"/);
  assert.match(contactHardening, /is_adult_birth_date\(\(select birth_date from public\.profiles where id = auth\.uid\(\)\)\)/);
  assert.match(contactHardening, /not public\.is_adult_birth_date\(\(select birth_date from public\.profiles where id = me\)\)/);
});

test("profile setup surfaces age-gate results instead of reporting a false save", () => {
  assert.match(profileActions, /saveResult/);
  assert.match(profileActions, /saveResult === "underage"/);
  assert.match(profileActions, /saveResult === "restricted" \|\| saveResult === "cooldown"/);
  assert.match(profileActions, /server\.profile\.underage/);
  assert.match(profileSetup, /app\.profile\.requestCorrection/);
});

test("active verified age restrictions cannot be bypassed with an adult profile save", () => {
  assert.match(restrictedSaveFix, /from public\.age_restrictions/);
  assert.match(restrictedSaveFix, /blocked_until > current_date/);
  assert.match(restrictedSaveFix, /return 'restricted'/);
  assert.match(restrictedSaveFix, /grant execute on function public\.age_gate_validate_current_user\(date\) to authenticated/);
});
