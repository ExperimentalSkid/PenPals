import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync(new URL("../supabase/migrations/20260905180000_seo_internal_discovery_graph.sql", import.meta.url), "utf8");
const slugGuardMigration = fs.readFileSync(new URL("../supabase/migrations/20260905181000_seo_internal_discovery_graph_slug_guard.sql", import.meta.url), "utf8");
const page = fs.readFileSync(new URL("../src/app/seo/SeoSurfacePage.tsx", import.meta.url), "utf8");

test("SEO graph filters related links to independently indexable targets", () => {
  assert.match(migration, /get_public_seo_surface_graph/);
  assert.match(migration, /target_eligibility\.eligibility_state = 'eligible_indexable'/g);
  assert.match(migration, /target_eligibility\.is_indexable = true/g);
  assert.match(migration, /limit 12/g);
  assert.match(migration, /revoke all on function public\.get_public_seo_surface_graph/);
});

test("SEO graph excludes ambiguous language and interest slugs", () => {
  assert.match(slugGuardMigration, /count\(\*\).*duplicate_language/);
  assert.match(slugGuardMigration, /count\(\*\).*duplicate_interest/);
  assert.match(slugGuardMigration, /revoke all on function public\.get_public_seo_surface_graph/);
});

test("public SEO related links use descriptive crawlable anchors", () => {
  assert.match(page, /function relatedAnchor/);
  assert.match(page, /Pen pals in \$\{item\.name\}/);
  assert.match(page, /Pen pals who speak \$\{item\.name\}/);
  assert.match(page, /Pen pals interested in \$\{item\.name\}/);
  assert.match(page, /<Link key=/);
});
