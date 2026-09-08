import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../supabase/migrations/20260902170000_account_deletion_retention.sql", import.meta.url), "utf8");
const actions = await readFile(new URL("../src/app/app/settings/data-actions.ts", import.meta.url), "utf8");
const inventory = await readFile(new URL("../docs/data-inventory.md", import.meta.url), "utf8");
const exportMigration = await readFile(new URL("../supabase/migrations/20260902171000_account_deletion_consumers.sql", import.meta.url), "utf8");
const scopedHoldMigration = await readFile(new URL("../supabase/migrations/20260902173000_repair_deletion_holds_runtime.sql", import.meta.url), "utf8");
const recordRetentionMigration = await readFile(new URL("../supabase/migrations/20260902174000_scope_record_retention.sql", import.meta.url), "utf8");
const auditLinkMigration = await readFile(new URL("../supabase/migrations/20260902175000_preserve_audit_links.sql", import.meta.url), "utf8");
const actorEvidenceMigration = await readFile(new URL("../supabase/migrations/20260902176000_remove_deleted_actor_evidence.sql", import.meta.url), "utf8");
const runtimeFixMigration = await readFile(new URL("../supabase/migrations/20260902210000_fix_data_rights_runtime_authorization.sql", import.meta.url), "utf8");
const messagesList = await readFile(new URL("../src/app/app/messages/page.tsx", import.meta.url), "utf8");
const conversationPage = await readFile(new URL("../src/app/app/messages/[id]/page.tsx", import.meta.url), "utf8");
const adminConversationPage = await readFile(new URL("../src/app/app/admin/conversations/[id]/page.tsx", import.meta.url), "utf8");
const notificationsPage = await readFile(new URL("../src/app/app/notifications/page.tsx", import.meta.url), "utf8");

test("shared messages survive account deletion with an anonymized sender", () => {
  assert.match(migration, /alter table public\.messages[\s\S]*alter column sender_id drop not null/);
  assert.match(migration, /messages_sender_id_fkey[\s\S]*on delete set null/);
  assert.match(migration, /delete from public\.conversation_participants where user_id = me/);
  assert.match(migration, /delete from public\.conversations c[\s\S]*not exists/);
  assert.match(inventory, /Deleted user/);
});

test("account deletion locks the account and affected conversations", () => {
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\('penpal-account-delete:/);
  assert.match(migration, /from auth\.users u[\s\S]*for update/);
  assert.match(migration, /from public\.conversation_participants cp[\s\S]*for update/);
});

test("deleted account data is erased transactionally without pre-deleting photos", () => {
  assert.match(migration, /insert into public\.account_storage_deletion_outbox\(path\)/);
  assert.match(migration, /delete from public\.profiles where id = me/);
  assert.match(migration, /delete from auth\.users where id = me/);
  assert.doesNotMatch(migration.slice(migration.indexOf("create or replace function public.delete_my_account")), /storage\.from|storage\.remove/);
  const deletionBlock = actions.slice(actions.indexOf("export async function deleteAccount"));
  assert.match(deletionBlock, /delete_my_account/);
  assert.match(deletionBlock, /cleanupAvatarDeletionOutbox/);
  assert.doesNotMatch(deletionBlock.slice(0, deletionBlock.indexOf("delete_my_account")), /storage\.from\("avatars"\)\.remove/);
});

test("storage cleanup outbox is protected, retryable, and idempotent", () => {
  assert.match(migration, /create table if not exists public\.account_storage_deletion_outbox/);
  assert.match(migration, /path text not null unique/);
  assert.match(migration, /completed_at timestamptz/);
  assert.match(migration, /claim_avatar_deletion_batch/);
  assert.match(migration, /complete_avatar_deletion_batch/);
  assert.match(migration, /fail_avatar_deletion_batch/);
  assert.match(migration, /for update skip locked/);
  assert.match(migration, /grant execute on function public\.claim_avatar_deletion_batch\(integer\) to service_role/);
  assert.match(actions, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(actions, /ack_my_avatar_deletions/);
});

test("pending and standalone introductions are removed while the opener message remains", () => {
  assert.match(migration, /delete from public\.conversation_introductions[\s\S]*where sender_id = me or recipient_id = me/);
  assert.match(migration, /Replied introductions[\s\S]*copied into messages/);
  assert.match(migration, /sender_id becomes NULL[\s\S]*shared messages anonymized/);
});

test("retention-sensitive references can be severed without exposing live identity", () => {
  assert.match(migration, /profile_moderation_evidence[\s\S]*alter column target_user_id drop not null/);
  assert.match(migration, /profile_moderation_evidence_target_user_id_fkey[\s\S]*on delete set null/);
  assert.match(migration, /moderation_audit_log_report_id_fkey[\s\S]*on delete set null/);
  assert.match(migration, /alter table public\.reports[\s\S]*alter column target_id drop not null/);
  assert.match(migration, /redacted_at timestamptz/);
  assert.match(migration, /previous_value = null/);
  assert.match(migration, /metadata = jsonb_build_object\('redacted_after_account_deletion', true\)/);
});

test("retention configuration is protected and has no default duration", () => {
  assert.match(migration, /create table if not exists public\.data_retention_policies/);
  assert.match(migration, /retention_period interval/);
  assert.match(migration, /auth_security.*moderation_audit.*moderation_evidence/s);
  assert.match(migration, /create table if not exists public\.data_retention_holds/);
  assert.match(migration, /record_id uuid/);
  assert.match(migration, /if not public\.is_admin\(\)/);
  assert.match(migration, /grant execute on function public\.set_data_retention_policy/);
  assert.match(migration, /grant execute on function public\.set_data_retention_hold/);
  assert.match(migration, /grant execute on function public\.release_data_retention_hold/);
  assert.match(migration, /No retention periods are seeded/);
});

test("purge skips unconfigured categories and honors record or category holds", () => {
  assert.match(migration, /where enabled and retention_period is not null/);
  assert.match(migration, /released_at is null/);
  assert.match(migration, /record_id is null or h\.record_id =/);
  assert.match(migration, /Provider-managed auth audit entries were not modified/);
  assert.match(migration, /purge_retained_data/);
});

test("record-specific holds do not retain unrelated account data", () => {
  assert.match(scopedHoldMigration, /h\.record_id is null or h\.record_id = any\(report_ids\)/);
  assert.match(scopedHoldMigration, /e\.id = h\.record_id and e\.target_user_id = me/);
  assert.match(scopedHoldMigration, /a\.id = h\.record_id/);
});

test("record-specific retention keeps only held reports, evidence, and audits", () => {
  assert.match(recordRetentionMigration, /r\.id = any\(report_ids\)[\s\S]*h\.record_id = r\.id/);
  assert.match(recordRetentionMigration, /e\.target_user_id = me[\s\S]*h\.record_id = e\.id/);
  assert.match(recordRetentionMigration, /a\.target_user_id = me[\s\S]*h\.record_id = a\.id/);
});

test("audit retention captures linked rows before report FK cleanup", () => {
  assert.match(auditLinkMigration, /array_agg\(a\.id\).*into audit_ids/);
  assert.match(auditLinkMigration, /a\.id = any\(audit_ids\)/);
  assert.match(auditLinkMigration, /report_id = any\(report_ids\)/);
});

test("deleting a moderator removes or redacts evidence they authored", () => {
  assert.match(actorEvidenceMigration, /e\.target_user_id = me or e\.moderator_id = me/);
  assert.match(actorEvidenceMigration, /select coalesce\(array_agg\(e\.id\).*into evidence_ids/);
  assert.match(actorEvidenceMigration, /set moderator_id = null, target_user_id = null/);
  assert.match(actorEvidenceMigration, /delete from public\.profile_moderation_evidence e where e\.id = any\(evidence_ids\)/);
});

test("account erasure and retention purge can pass the immutable-audit guard only through protected paths", () => {
  assert.match(runtimeFixMigration, /app\.allow_moderation_audit_mutation/);
  assert.match(runtimeFixMigration, /auth\.role\(\) = 'authenticated'/);
  assert.match(runtimeFixMigration, /perform set_config\('app\.allow_moderation_audit_mutation', '1', true\)/);
  assert.match(runtimeFixMigration, /create or replace function public\.delete_my_account\(\)/);
  assert.match(runtimeFixMigration, /create or replace function public\.purge_retained_data\(\)/);
  assert.match(runtimeFixMigration, /grant execute on function public\.claim_avatar_deletion_batch\(integer\) to service_role/);
});

test("deletion is recent-authenticated and removes live identity capabilities", () => {
  assert.match(migration, /recent_sign_in < now\(\) - interval '15 minutes'/);
  assert.match(migration, /delete from public\.direct_conversation_pairs/);
  assert.match(migration, /delete from public\.profile_photo_access_requests/);
  assert.match(migration, /delete from public\.profile_photo_access_grants/);
  assert.match(inventory, /profile links/);
  assert.match(inventory, /presence|live identity/i);
});

test("retained reports and evidence are redacted, while reporter-owned reports are erased", () => {
  assert.match(migration, /target_id = null/);
  assert.match(migration, /details = case when r\.details is null then null else '\[redacted after account deletion\]'/);
  assert.match(migration, /delete from public\.reports where reporter_id = me/);
  assert.match(migration, /keep_evidence/);
  assert.match(migration, /keep_audit/);
});

test("server cleanup keeps service credentials out of browser code", () => {
  assert.match(actions, /"use server"/);
  assert.match(actions, /createSupabaseClient/);
  assert.match(actions, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(inventory, /service-role key/i);
});

test("deleted senders stay anonymized in exports and conversation consumers", () => {
  assert.match(exportMigration, /when m\.sender_id is null then 'Deleted user'/);
  assert.match(exportMigration, /left join public\.profiles p on p\.id = m\.sender_id/);
  assert.match(messagesList, /deletedOther/);
  assert.match(messagesList, /Deleted user/);
  assert.match(conversationPage, /const deletedOther = !otherParticipant/);
  assert.match(conversationPage, /const otherName = deletedOther \? "Deleted user"/);
  assert.match(adminConversationPage, /message\.sender_display_name \|\| message\.sender_username \|\| "Deleted user"/);
  assert.match(notificationsPage, /personName = person\?\.display_name \?\? person\?\.username \?\? "Deleted user"/);
  assert.match(conversationPage, /deletedOpening/);
});
