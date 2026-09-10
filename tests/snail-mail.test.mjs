import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20260903020000_snail_mail.sql", root), "utf8");
const transportMigration = await readFile(new URL("supabase/migrations/20260903030000_snail_mail_transport_modes.sql", root), "utf8");
const actions = await readFile(new URL("src/app/app/messages/actions.ts", root), "utf8");
const conversationPage = await readFile(new URL("src/app/app/messages/[id]/page.tsx", root), "utf8");
const panel = await readFile(new URL("src/app/app/messages/[id]/SnailMailPanel.tsx", root), "utf8");
const worker = await readFile(new URL("scripts/run-background-jobs.mjs", root), "utf8");

test("Snail Mail stores an immutable letter with a server-side ETA snapshot", () => {
  assert.match(migration, /create table if not exists public\.snail_mail_letters/i);
  assert.match(migration, /body text not null/i);
  assert.match(migration, /sent_at timestamptz not null default now\(\)/i);
  assert.match(migration, /deliver_at timestamptz not null/i);
  assert.match(migration, /sender_country_code text/i);
  assert.match(migration, /recipient_locality_id bigint/i);
  assert.match(migration, /Snail Mail letters cannot be edited/i);
  assert.match(migration, /snail_mail_delivery_hours/i);
});

test("Snail Mail is participant-only and masks an early recipient body", () => {
  assert.match(migration, /revoke all on table public\.snail_mail_letters from public, anon, authenticated/i);
  assert.match(migration, /not exists \(select 1 from public\.conversation_participants/i);
  assert.match(migration, /case when l\.sender_id = me or l\.deliver_at <= now\(\) then l\.body else null end/i);
  assert.match(migration, /Conversation unavailable/i);
  assert.match(migration, /profile_blocks/i);
});

test("send and read RPCs preserve idempotency and delivery-only unread state", () => {
  assert.match(migration, /client_idempotency_key uuid/i);
  assert.match(migration, /snail_mail_sender_idempotency_idx/i);
  assert.match(migration, /return existing_id/i);
  assert.match(migration, /l\.recipient_id = me and l\.delivered_at is not null and l\.recipient_read_at is null/i);
  assert.match(migration, /mark_snail_mail_read/i);
  assert.match(migration, /Letter is not delivered/i);
});

test("delivery processing is durable, idempotent, and service-role-only", () => {
  assert.match(migration, /process_snail_mail_delivery\(batch_size integer default 100\)/i);
  assert.match(migration, /auth\.role\(\).*service_role/i);
  assert.match(migration, /for update of l skip locked/i);
  assert.match(migration, /l\.delivered_at is null/i);
  assert.match(migration, /p\.inactive_mode = false/i);
  assert.match(migration, /grant execute on function public\.process_snail_mail_delivery\(integer\) to service_role/i);
  assert.match(worker, /process_snail_mail_delivery/i);
});

test("server action and conversation UI expose Snail Mail without changing instant messaging", () => {
  assert.match(actions, /export async function sendSnailMail/);
  assert.match(actions, /db\.rpc\("send_snail_mail"/);
  assert.match(actions, /idempotency_key/);
  assert.match(conversationPage, /db\.rpc\("list_snail_mail"/);
  assert.match(conversationPage, /<SnailMailPanel/);
  assert.match(panel, /app\.snail\.write/);
  assert.match(panel, /The letter is sealed until delivery/);
  assert.match(panel, /role="progressbar"/);
  assert.match(panel, /app\.snail\.open/);
});

test("coarse delivery bands use country, region, locality, and protected macro-region configuration", () => {
  assert.match(migration, /sender_country is not null and sender_country = recipient_country/i);
  assert.match(migration, /return 6;/);
  assert.match(migration, /return 12;/);
  assert.match(migration, /return 24;/);
  assert.match(migration, /return 48;/);
  assert.match(migration, /return 96;/);
  assert.match(migration, /snail_mail_country_groups/);
  assert.match(migration, /alter table public\.snail_mail_country_groups enable row level security/i);
  assert.match(migration, /revoke all on table public\.snail_mail_country_groups from public, anon, authenticated/i);
  assert.doesNotMatch(migration, /random\(|random\s*\)/i);
});

test("transport mode and delivery story are server-snapshotted without a client mode parameter", () => {
  assert.match(transportMigration, /transport_mode text not null default 'standard'/i);
  assert.match(transportMigration, /distance_band text not null default 'long_distance'/i);
  assert.match(transportMigration, /base_delivery_hours integer not null/i);
  assert.match(transportMigration, /transport_multiplier numeric\(5,2\) not null/i);
  assert.match(transportMigration, /story_seed integer not null/i);
  assert.match(transportMigration, /story_variant smallint not null/i);
  assert.match(transportMigration, /transport_mode in \('express', 'standard', 'economy', 'air_mail', 'rail', 'sea_mail', 'rare_pigeon'\)/i);
  assert.doesNotMatch(transportMigration, /p_transport_mode|transport_mode\s+text\s+default\s+null\s*\)/i);
  assert.match(transportMigration, /seed_text := me::text \|\| '\|' \|\| other_user::text/i);
  assert.match(transportMigration, /hashtextextended\(seed_text/i);
  assert.match(transportMigration, /transport_mode := public\.snail_mail_choose_transport/i);
  assert.match(transportMigration, /story_seed % 3/i);
  assert.match(transportMigration, /transport_mode is distinct from old\.transport_mode/i);
  assert.match(transportMigration, /deliver_at is distinct from old\.deliver_at/i);
  const idempotencyCheck = transportMigration.indexOf("if idempotency_key is not null then");
  const transportSelection = transportMigration.indexOf("transport_mode := public.snail_mail_choose_transport");
  assert.ok(idempotencyCheck >= 0 && idempotencyCheck < transportSelection, "idempotent retries return before selecting transport");
});

test("transport selection keeps geographic sense and bounded ETA variation", () => {
  assert.match(transportMigration, /if distance_band = 'nearby'/i);
  assert.match(transportMigration, /elsif distance_band = 'in_country'/i);
  assert.match(transportMigration, /elsif distance_band = 'regional'/i);
  assert.match(transportMigration, /if bucket = 0 then return 'rare_pigeon'/i);
  assert.match(transportMigration, /Long routes strongly prefer realistic modes/i);
  assert.match(transportMigration, /transport_multiplier between 0\.60 and 1\.50/i);
  assert.match(transportMigration, /when 'express' then 0\.65/i);
  assert.match(transportMigration, /when 'sea_mail' then 1\.45/i);
  assert.match(transportMigration, /when 'rare_pigeon' then 1\.05/i);
  assert.match(transportMigration, /final_eta_hours := greatest\(1, ceil\(base_eta_hours::numeric \* transport_multiplier\)/i);
  assert.match(transportMigration, /Long routes.*rail and pigeon.*excluded/is);
  const nearbyChooser = transportMigration.slice(transportMigration.indexOf("if distance_band = 'nearby'"), transportMigration.indexOf("elsif distance_band = 'in_country'"));
  assert.doesNotMatch(nearbyChooser, /sea_mail|air_mail/i);
  const longChooser = transportMigration.slice(transportMigration.indexOf("else\n    -- Long routes"), transportMigration.indexOf("end;\n$$;", transportMigration.indexOf("else\n    -- Long routes")));
  assert.doesNotMatch(longChooser, /return 'rare_pigeon'|return 'rail'/i);
});

test("legacy letters keep their ETA while receiving compatible transport metadata", () => {
  assert.match(transportMigration, /Preserve already-snapshotted delivery times/i);
  assert.match(transportMigration, /base_delivery_hours = greatest\(1, round\(extract\(epoch from \(deliver_at - sent_at\)\)/i);
  assert.match(transportMigration, /deliver_at - sent_at/i);
  assert.match(transportMigration, /transport_mode = 'standard'/i);
  assert.match(transportMigration, /where true;/i);
});

test("list/get RPCs return transport and story metadata while retaining participant masking", () => {
  assert.match(transportMigration, /transport_mode text,\s*distance_band text,\s*base_delivery_hours integer/is);
  assert.match(transportMigration, /l\.transport_mode, l\.distance_band, l\.base_delivery_hours/is);
  assert.match(transportMigration, /l\.transport_multiplier, l\.story_seed, l\.story_variant/is);
  assert.match(transportMigration, /case when l\.sender_id = me or l\.deliver_at <= now\(\) then l\.body else null end/is);
  assert.match(transportMigration, /drop function if exists public\.list_snail_mail\(uuid\)/i);
  assert.match(transportMigration, /grant execute on function public\.list_snail_mail\(uuid\) to authenticated/i);
});

test("delivery stories derive from progress and include the rare pigeon copy", () => {
  assert.match(panel, /function milestone\(/i);
  assert.match(panel, /Posted/);
  assert.match(panel, /Sorting/);
  assert.match(panel, /Crossing the border/);
  assert.match(panel, /Crossing the sea/);
  assert.match(panel, /In transit/);
  assert.match(panel, /Out for delivery/);
  assert.match(panel, /Delivered/);
  assert.match(panel, /A very determined pigeon has accepted the assignment\./i);
  assert.match(panel, /transportLabel\(/i);
  assert.match(panel, /progress\(letter, now\)/i);
  assert.match(panel, /setInterval\(\(\) => setCurrentNow\(Date\.now\(\)\), 60_000\)/i);
});
