import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../supabase/migrations/20260904170000_mystery_profile_pick_game.sql", import.meta.url), "utf8");
const fixMigration = await readFile(new URL("../supabase/migrations/20260904171000_fix_mystery_pick_session_id.sql", import.meta.url), "utf8");
const floorMigration = await readFile(new URL("../supabase/migrations/20260904172000_mystery_pick_relevance_floor.sql", import.meta.url), "utf8");
const discoverPage = await readFile(new URL("../src/app/app/discover/page.tsx", import.meta.url), "utf8");
const mysteryPage = await readFile(new URL("../src/app/app/discover/mystery/page.tsx", import.meta.url), "utf8");
const board = await readFile(new URL("../src/app/app/discover/mystery/MysteryPickBoard.tsx", import.meta.url), "utf8");
const actions = await readFile(new URL("../src/app/app/discover/mystery/actions.ts", import.meta.url), "utf8");

test("Mystery Pick stores three opaque cards behind private RLS tables", () => {
  for (const table of ["mystery_pick_sessions", "mystery_pick_cards", "mystery_pick_exposures"]) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(migration, /revoke all on table public\.mystery_pick_sessions, public\.mystery_pick_cards, public\.mystery_pick_exposures from public, anon, authenticated/);
  assert.match(migration, /unique \(session_id, candidate_id\)/);
  assert.match(migration, /expires_at timestamptz not null default \(now\(\) \+ interval '15 minutes'\)/);
  assert.match(migration, /jsonb_build_object\('token', c\.id, 'position', c\.position\)/);
  const createReturnStart = migration.indexOf("return jsonb_build_object(\n    'status', 'ready'");
  const createReturnEnd = migration.indexOf("end;\n$function$;", createReturnStart);
  assert.doesNotMatch(migration.slice(createReturnStart, createReturnEnd), /display_name|birth_date|country|quote|interest|candidate_id|score/);
});

test("candidate selection reuses eligibility and friendship-only relevance without gender scoring", () => {
  for (const clause of [
    "public.is_email_verified()",
    "v.deactivated_at is null",
    "v.inactive_mode = false",
    "p.deactivated_at is null",
    "p.inactive_mode = false",
    "public.is_adult_birth_date(p.birth_date)",
    "p.last_active_at >= now() - interval '7 days'",
    "public.viewer_can_access_profile(p.id)",
    "profile_blocks",
    "profile_introduction_country_exclusions",
    "p.accepting_new_conversations = true",
    "p.introduction_scope <> 'nobody'",
    "allow_instant_messages",
    "allow_snail_mail",
  ]) assert.match(migration, new RegExp(clause.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  const scoreStart = migration.indexOf("create or replace function public.mystery_pick_relevance_score");
  const scoreEnd = migration.indexOf("revoke all on function public.mystery_pick_relevance_score", scoreStart);
  const score = migration.slice(scoreStart, scoreEnd);
  for (const factor of ["profile_interests", "profile_languages", "connection_goals", "profile_friendship_destinations"]) assert.match(score, new RegExp(factor));
  assert.doesNotMatch(score, /gender/i);
  assert.doesNotMatch(score, /romantic|compatib|match_percentage|match_score/i);
});

test("three controlled candidate types are shuffled and recent exposure is reduced", () => {
  for (const clause of ["strong as", "balanced as", "wildcard as", "order by random()", "mystery_pick_exposures", "last_exposed_at > now() - interval '7 days'", "array_length(selected_ids, 1), 0\) <> 3"]) {
    assert.match(migration, new RegExp(clause.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(migration, /exposure_count = public\.mystery_pick_exposures\.exposure_count \+ 1/);
  assert.match(migration, /last_selected_at = now\(\)/);
  assert.match(floorMigration, /qualified as \([\s\S]*where s\.score >= 5/);
});

test("resolution rechecks eligibility, consumes one card, and never creates contact activity", () => {
  assert.match(migration, /create or replace function public\.resolve_mystery_pick\(card_token uuid\)/);
  assert.match(migration, /c\.viewer_id = me/);
  assert.match(migration, /s\.expires_at > now\(\)/);
  assert.match(migration, /if not public\.mystery_pick_eligible\(me, card\.candidate_id\)/);
  assert.match(migration, /return jsonb_build_object\('status', 'unavailable'\)/);
  assert.match(migration, /return jsonb_build_object\('status', 'resolved', 'username', profile_username\)/);
  assert.doesNotMatch(migration, /insert into public\.(messages|conversation_introductions|notifications)/);
  assert.match(actions, /rpc\("resolve_mystery_pick"/);
  assert.match(actions, /redirect\(`\/app\/profile\//);
});

test("mystery UI exposes only anonymous cards before selection", () => {
  assert.match(discoverPage, /href="\/app\/discover\/mystery"/);
  assert.match(mysteryPage, /rpc\("create_mystery_pick"/);
  assert.match(mysteryPage, /cards\.length === 3/);
  for (const privateField of ["display_name", "username", "birth_date", "country", "location", "quote", "interests", "score", "gender"]) {
    assert.doesNotMatch(board, new RegExp(privateField, "i"), `board leaked ${privateField}`);
  }
  assert.match(board, /<button[\s\S]*type="submit"/);
  assert.match(board, /aria-label=\{`Mystery card \$\{card\.position\}`\}/);
  assert.match(board, /motion-reduce:/);
  assert.match(board, /setChosen\(card\.token\)/);
  assert.match(board, /disabled=\{disabled\}/);
});

test("server-side fix migration removes session_id variable ambiguity", () => {
  assert.match(fixMigration, /new_session_id uuid/);
  assert.match(fixMigration, /returning id into new_session_id/);
  assert.match(fixMigration, /select new_session_id, me, candidate_id/);
  assert.match(fixMigration, /where c\.session_id = new_session_id/);
});
