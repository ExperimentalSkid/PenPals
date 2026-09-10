import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/app/components/LanguageSwitcher.tsx", import.meta.url), "utf8");

test("language switching preserves public-page query state", () => {
  assert.match(source, /useSearchParams/);
  assert.match(source, /const query = searchParams\.toString\(\)/);
  assert.match(source, /`\$\{targetPath\}\?\$\{query\}`/);
});
