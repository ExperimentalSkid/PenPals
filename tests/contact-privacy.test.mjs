import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../supabase/migrations/20260901150000_add_availability_contact_privacy.sql", import.meta.url), "utf8");
const countryFixSql = await readFile(new URL("../supabase/migrations/20260902203000_fix_country_exclusion_matching.sql", import.meta.url), "utf8");

test("availability defaults to available and is constrained to available or away", () => {
  assert.match(sql, /availability text not null default 'available'/i);
  assert.match(sql, /availability in \('available', 'away'\)/i);
});

test("country exclusions are relational, unique, indexed, and owner-controlled", () => {
  assert.match(sql, /create table if not exists public\.profile_introduction_country_exclusions/i);
  assert.match(sql, /primary key \(profile_id, country_code\)/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /profile_id = auth\.uid\(\)/i);
  assert.match(sql, /country_idx/i);
});

test("introduction submission hides country restrictions behind a generic error", () => {
  assert.match(sql, /profile_introduction_country_exclusions/i);
  assert.match(sql, /upper\(trim\(e\.country_code\)\)/i);
  assert.match(sql, /raise exception 'Conversation unavailable'/i);
});

test("country exclusions match stored country names through the private canonical map", () => {
  assert.match(countryFixSql, /create table if not exists public\.country_codes/i);
  assert.match(countryFixSql, /\('NO', 'Norway'\)/i);
  assert.match(countryFixSql, /country_code_matches_name/i);
  assert.match(countryFixSql, /country_code_matches_name\(e\.country_code, sender_country\)/i);
  assert.match(countryFixSql, /revoke all on table public\.country_codes from public, anon, authenticated/i);
});

test("existing block checks remain enforced", () => {
  assert.match(sql, /profile_blocks/i);
  assert.match(sql, /blocker_id = me and blocked_id = other_user/i);
  assert.match(sql, /blocker_id = other_user and blocked_id = me/i);
});
