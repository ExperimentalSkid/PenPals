import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const migration = await read("supabase/migrations/20260902250000_moderation_content_flagging.sql");
const lintFix = await read("supabase/migrations/20260902250100_fix_content_flagging_lint.sql");
const detectionPack = await read("supabase/migrations/20260903230000_adult_commercial_detection_pack.sql");
const bridgeSignals = await read("supabase/migrations/20260904030000_bridge_review_signals.sql");
const activePlatforms = await read("supabase/migrations/20260904040000_add_active_adult_platforms.sql");
const contextualPairing = await read("supabase/migrations/20260904060000_contextual_creator_pairing.sql");
const conversation = await read("src/app/app/messages/[id]/page.tsx");
const thread = await read("src/app/app/messages/[id]/ConversationThread.tsx");
const caseDetail = await read("src/app/app/admin/cases/[id]/page.tsx");
const casesQueue = await read("src/app/app/admin/cases/page.tsx");
const audit = await read("src/app/app/admin/audit/page.tsx");
const rules = await read("src/app/app/admin/moderation-rules/page.tsx");

test("adult-service detection uses protected configurable rules", () => {
  assert.match(migration, /create table if not exists public\.moderation_detection_rules/);
  assert.match(migration, /rule_identifier text not null unique/);
  assert.match(migration, /match_type text not null default 'word'/);
  assert.match(migration, /adult_service_other/);
  assert.match(migration, /revoke all on table public\.moderation_detection_rules from public, anon, authenticated/);
  assert.match(migration, /admin_upsert_moderation_detection_rule/);
  assert.match(migration, /if not public\.is_admin\(\) then raise exception 'Administrator authorization required'/);
  assert.match(rules, /requireAdmin/);
});

test("flags preserve content and attach to a review case without enforcement", () => {
  assert.match(migration, /create table if not exists public\.moderation_content_flags/);
  assert.match(migration, /content_snapshot text not null/);
  assert.match(migration, /category text not null/);
  assert.match(migration, /target_user_id uuid references public\.profiles/);
  assert.match(migration, /conversation_id uuid references public\.conversations/);
  assert.match(migration, /source text not null default 'automated'/);
  assert.match(migration, /create table if not exists public\.moderation_case_flags/);
  assert.match(migration, /source = 'automated_flag'/);
  assert.match(migration, /75, 'automated_flag'/);
  assert.doesNotMatch(migration, /deactivate_account|admin_set_account_status|delete from public\.profiles/);
});

test("exact active flags deduplicate and do not affect reporter metrics", () => {
  assert.match(migration, /moderation_content_flags_active_unique/);
  assert.match(migration, /where status = 'flagged_for_review'/);
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\('auto-flag:'/);
  assert.match(migration, /on conflict \(report_id\) do nothing/);
  assert.doesNotMatch(migration.slice(migration.indexOf("flag_moderation_content"), migration.indexOf("create or replace function public.flag_profile_content")), /independent_reporter_count\s*=/);
});

test("profile, introduction, and message content are flagged server-side", () => {
  assert.match(migration, /create trigger profile_content_moderation_flag/);
  assert.match(migration, /create trigger message_content_moderation_flag/);
  assert.match(migration, /create trigger introduction_content_moderation_flag/);
  assert.match(migration, /content_field text/);
  assert.match(migration, /field_name in \('username','bio','quote','looking_for','introduction','message'\)/);
  assert.match(migration, /moderation_status = 'flagged_for_review'/);
  assert.match(migration, /profiles_moderation_flagged_fields_check/);
  assert.match(migration, /protect_moderation_status_columns/);
});

test("staff context is bounded and resolutions are audited", () => {
  assert.match(migration, /admin_get_moderation_case_flags\(case_uuid uuid\)/);
  assert.match(migration, /limit 11/);
  assert.match(migration, /automated_flag_context_view/);
  assert.match(migration, /resolve_moderation_content_flag/);
  assert.match(migration, /automated_flag_cleared/);
  assert.match(migration, /automated_flag_confirmed/);
  assert.match(migration, /sync_flags_on_case_resolution/);
  assert.match(caseDetail, /admin_get_moderation_case_flags/);
  assert.match(caseDetail, /Flagged|Automated review signals/);
  assert.match(caseDetail, /resolveModerationFlag/);
  assert.match(casesQueue, /automated flag|Human report \+ automated signal/i);
  assert.match(audit, /automated_flag_created/);
});

test("normal users see only generic review indicators", () => {
  assert.match(conversation, /moderation_status/);
  assert.match(conversation, /This conversation has content under moderation review/);
  assert.match(thread, /Flagged for review/);
  assert.doesNotMatch(conversation, /rule_identifier|content_snapshot/);
  assert.doesNotMatch(thread, /rule_identifier|content_snapshot/);
});

test("security-definer functions use fixed paths and direct tables stay private", () => {
  assert.match(migration, /security definer set search_path = pg_catalog, public/);
  assert.match(migration, /revoke all on table public\.moderation_content_flags from public, anon, authenticated/);
  assert.match(migration, /revoke all on function public\.flag_moderation_content/);
  assert.match(migration, /grant execute on function public\.admin_get_moderation_case_flags\(uuid\) to authenticated/);
  assert.match(migration, /grant execute on function public\.resolve_moderation_content_flag\(uuid, text, text\) to authenticated/);
  assert.match(lintFix, /on conflict on constraint moderation_detection_rules_rule_identifier_key/);
});

test("adult/commercial detection pack is centralized, categorized, and idempotently seeded", () => {
  for (const domain of [
    "onlyfans.com", "fansly.com", "manyvids.com", "loyalfans.com", "fancentro.com",
    "justfor.fans", "clips4sale.com", "iwantclips.com", "admireme.vip", "modelcentro.com",
    "chaturbate.com", "myfreecams.com", "stripchat.com", "bongacams.com", "livejasmin.com",
  ]) assert.match(detectionPack, new RegExp(domain.replace(".", "\\.")));
  for (const domain of ["luxeafterdark.com", "korz.one"]) {
    assert.match(activePlatforms, new RegExp(domain.replace(".", "\\.")));
  }
  for (const domain of ["fanvue.com", "patreon.com", "ko-fi.com", "buymeacoffee.com", "stan.store"]) {
    assert.match(detectionPack, new RegExp(domain.replace(".", "\\.")));
    assert.match(detectionPack, /creator_monetization/);
  }
  for (const domain of ["linktr.ee", "allmylinks.com", "beacons.ai", "taplink.cc", "lnk.bio", "bit.ly", "tinyurl.com"]) {
    assert.match(detectionPack, new RegExp(domain.replace(".", "\\.")));
  }
  assert.match(detectionPack, /signal_strength/);
  assert.match(detectionPack, /is_system_default/);
  assert.match(detectionPack, /requires_context/);
  assert.match(detectionPack, /on conflict \(rule_identifier\) do nothing/);
  assert.match(detectionPack, /seed_adult_commercial_detection_rules/);
  assert.match(detectionPack, /commercial_solicitation/);
  assert.match(detectionPack, /bridge_link/);
  assert.match(detectionPack, /obfuscated_link/);
});

test("normalization handles Unicode/zero-width and conservative dot obfuscation", () => {
  assert.match(detectionPack, /normalize\(\$1, NFKC\)/);
  assert.match(detectionPack, /chr\(8203\)/);
  assert.match(detectionPack, /chr\(65279\)/);
  assert.match(detectionPack, /regexp_replace\(normalized, '\\\\?\[|dot/);
  assert.match(detectionPack, /public\.moderation_rule_matches\(rule_term text, rule_match_type text, content text\)/);
  assert.doesNotMatch(detectionPack, /rule_identifier.*'handle\.of'.*'of'/);
});

test("contextual promotion and creator signals are not standalone adult proof", () => {
  assert.match(detectionPack, /'context\.link-in-bio'.*true,'promotion'/);
  assert.match(detectionPack, /'bridge\.linktr\.ee'.*true,'bridge'/);
  assert.match(detectionPack, /'creator\.patreon\.com'.*true,'creator'/);
  assert.match(detectionPack, /other\.category <> 'creator_monetization'/);
  assert.match(detectionPack, /rule_row\.context_group in \('promotion','bridge'\)/);
  assert.match(detectionPack, /where enabled order by id/);
  assert.match(detectionPack, /on conflict \(rule_identifier\) do nothing/);
});

test("bridge domains are review signals without being adult classifications", () => {
  assert.match(bridgeSignals, /category = 'bridge_link'/);
  assert.match(bridgeSignals, /requires_context = false/);
  assert.match(bridgeSignals, /is_system_default = true/);
  assert.match(detectionPack, /'bridge_link'/);
  assert.match(detectionPack, /'REVIEW'/);
});

test("creator monetization requires a second contextual signal", () => {
  assert.match(contextualPairing, /context_group in \('promotion','bridge','creator'\)/);
  assert.match(contextualPairing, /rule_row\.context_group <> other\.context_group/);
  assert.match(detectionPack, /'creator\.patreon\.com'.*true,'creator'/);
});

test("same detector covers Snail Mail and preserved report targets without weakening access", () => {
  assert.match(detectionPack, /target_kind not in \('profile','introduction','message','snail_mail'\)/);
  assert.match(detectionPack, /create trigger snail_mail_content_moderation_flag/);
  assert.match(detectionPack, /create trigger report_content_moderation_flag/);
  assert.match(detectionPack, /content_snapshot/);
  assert.match(detectionPack, /matched_value/);
  assert.match(detectionPack, /revoke all on table public\.moderation_detection_rules/);
  assert.match(detectionPack, /revoke all on function public\.seed_adult_commercial_detection_rules/);
  assert.doesNotMatch(detectionPack, /auto-ban|auto_ban|deactivate_account|delete from public\.profiles/);
});
