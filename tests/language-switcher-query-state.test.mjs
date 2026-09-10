import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/app/components/LanguageSwitcher.tsx", import.meta.url), "utf8");

test("language switching preserves query state and performs a full reload", () => {
  assert.match(source, /useSearchParams/);
  assert.match(source, /const query = searchParams\.toString\(\)/);
  assert.match(source, /`\$\{targetPath\}\?\$\{query\}`/);
  assert.match(source, /if \(!targetPath\)[\s\S]*window\.location\.reload\(\)/);
  assert.match(source, /window\.location\.assign\(target\)/);
  assert.match(source, /window\.location\.reload\(\)/);
  assert.match(source, /"\/terms"/);
  assert.match(source, /"\/guidelines"/);
  assert.doesNotMatch(source, /router\.(?:push|refresh)\(/);
  assert.doesNotMatch(source, /supabase\.auth\.(?:getUser|updateUser)/);
  assert.doesNotMatch(source, /async function selectLocale/);
});
