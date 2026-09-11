import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("My Pen Pals aggregates private relationship correspondence stats", async () => {
  const migration = await read("supabase/migrations/20260911210000_my_pen_pals.sql");
  for (const marker of ["get_my_pen_pals", "sent_count", "received_count", "last_contact_at", "snail_mail_letters", "profile_blocks", "auth.uid()"])
    assert.match(migration, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("My Pen Pals page exposes sent received and last-contact stats", async () => {
  const [page, nav, app] = await Promise.all([
    read("src/app/app/pen-pals/page.tsx"),
    read("src/app/app/AppNavigation.tsx"),
    read("src/app/app/page.tsx"),
  ]);
  assert.match(page, /app\.penPals\.sent/);
  assert.match(page, /app\.penPals\.received/);
  assert.match(page, /app\.penPals\.lastContact/);
  assert.match(page, /app\/messages\/\$\{encodeURIComponent\(penPal\.conversation_id\)\}/);
  assert.match(nav, /\/app\/pen-pals/);
  assert.match(app, /redirect\('\/app\/pen-pals'\)/);
});
