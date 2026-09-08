import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const duplicateGuard = await readFile(new URL("supabase/migrations/20260904153000_prevent_duplicate_snail_mail_acceptance.sql", root), "utf8");
const actions = await readFile(new URL("src/app/app/messages/actions.ts", root), "utf8");
const profileView = await readFile(new URL("src/app/app/profile/[username]/ProfileView.tsx", root), "utf8");
const conversationPage = await readFile(new URL("src/app/app/messages/[id]/page.tsx", root), "utf8");

test("acceptance serializes participant pairs for Snail-Mail-only relationships", () => {
  assert.match(duplicateGuard, /pg_advisory_xact_lock\(hashtextextended\(a::text \|\| b::text, 0\)\)/);
  assert.match(duplicateGuard, /from public\.conversation_participants cp[\s\S]*join public\.conversation_participants cp2[\s\S]*cp\.user_id = me[\s\S]*cp2\.user_id = intro\.sender_id/);
  assert.match(duplicateGuard, /raise exception 'Conversation already exists'/);
  assert.ok(duplicateGuard.indexOf("cp.user_id = me") < duplicateGuard.indexOf("select d.conversation_id"), "participant pair must be checked before creating a new relationship");
});

test("contact actions and conversation UI remain mode-aware after acceptance", () => {
  assert.match(actions, /rpc\("submit_introduction"/);
  assert.match(actions, /rpc\("reply_to_introduction"/);
  assert.match(conversationPage, /get_public_communication_mode/);
  assert.match(conversationPage, /conversationMode === "snail_mail"/);
  assert.match(conversationPage, /canComposeSnailMail/);
  assert.match(profileView, /<IcebreakerModal action=\{startConversation\}/);
});
