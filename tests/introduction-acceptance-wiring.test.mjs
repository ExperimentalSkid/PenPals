import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20260904070000_wire_introduction_acceptance.sql", root), "utf8");
const timestampMigration = await readFile(new URL("supabase/migrations/20260904071000_preserve_introduction_response_timestamp.sql", root), "utf8");
const actions = await readFile(new URL("src/app/app/messages/actions.ts", root), "utf8");
const introductions = await readFile(new URL("src/app/app/introductions/page.tsx", root), "utf8");
const notificationPage = await readFile(new URL("src/app/app/notifications/page.tsx", root), "utf8");
const notifications = await readFile(new URL("supabase/migrations/20260901110000_add_privacy_notifications_accounts.sql", root), "utf8");

test("accepted introductions atomically establish the conversation and response opportunity", () => {
  assert.match(migration, /create or replace function public\.reply_to_introduction\(introduction_id uuid, reply text\)/);
  assert.match(migration, /from public\.conversation_introductions[\s\S]*for update/);
  assert.match(migration, /insert into public\.conversations/);
  assert.match(migration, /insert into public\.direct_conversation_pairs/);
  assert.match(migration, /insert into public\.conversation_participants/);
  assert.match(`${migration}\n${timestampMigration}`, /insert into public\.response_opportunities\(conversation_id, initiator_id, recipient_id, created_at\)/);
  assert.match(timestampMigration, /values \(existing_conversation_id, intro\.sender_id, intro\.recipient_id, intro\.created_at\)/);
  assert.match(migration, /on conflict \(conversation_id\) do nothing/);
  assert.match(migration, /insert into public\.messages/);
  assert.match(migration, /status = 'replied'/);
  assert.match(migration, /conversation_id_legacy = existing_conversation_id/);
});

test("acceptance respects new-contact communication mode and preserves existing pairs", () => {
  assert.match(migration, /if existing_conversation_id is null then/);
  assert.match(migration, /not allow_instant_messages/);
  assert.match(migration, /raise exception 'Conversation unavailable'/);
  assert.match(migration, /existing conversations remain usable/i);
});

test("reply action navigates to the created conversation and keeps failures in introductions", () => {
  assert.match(actions, /rpc\("reply_to_introduction"/);
  assert.match(actions, /server\.messages\.introOpenFailed/);
  assert.match(actions, /redirect\(`\/app\/messages\/\$\{conversationId\}`\)/);
  assert.match(introductions, /errorMessage = first\(params\.error\)/);
  assert.match(introductions, /role="alert"/);
});

test("a sent introduction returns to the canonical profile with success feedback intact", () => {
  assert.match(actions, /server\.messages\.introSent/);
  assert.doesNotMatch(actions, /redirect\(`\/profile\/\$\{username\}\?message=Introduction sent`\)/);
});

test("the existing introduction notification trigger announces acceptance to the sender", () => {
  assert.match(notifications, /elsif new\.status = 'replied'/);
  assert.match(notifications, /values \(new\.sender_id,'introduction_replied',new\.id\)/);
  assert.match(notificationPage, /select\("conversation_id_legacy"\)/);
  assert.match(notificationPage, /destination = introduction\?\.conversation_id_legacy \? `\/app\/messages\/\$\{introduction\.conversation_id_legacy\}`/);
  assert.match(notificationPage, /redirect\(destination\)/);
});
