import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const component = await readFile(new URL("src/app/components/ProfileBadge.tsx", root), "utf8");
const definitions = await readFile(new URL("src/lib/profile-badges.ts", root), "utf8");
const manifest = JSON.parse(await readFile(new URL("public/badges/badges.json", root), "utf8"));
const fullDir = new URL("public/badges/full/", root);
const iconDir = new URL("public/badges/icons/", root);

test("the supplied badge pack is present as production SVG assets", async () => {
  const fullAssets = await readdir(fullDir);
  const iconAssets = await readdir(iconDir);
  assert.ok(fullAssets.length >= 87);
  assert.ok(iconAssets.length >= 27);
  for (const entry of manifest.badges) {
    if (entry.svg) {
      await readFile(new URL(`public/badges/${entry.svg.replace(/^svg\//, "")}`, root));
    } else {
      await readFile(new URL(`public/badges/${entry.icon_svg.replace(/^svg\//, "")}`, root));
    }
    if (entry.icon_svg) await readFile(new URL(`public/badges/${entry.icon_svg.replace(/^svg\//, "")}`, root));
  }
});

test("badge rendering uses asset paths, viewer-facing explanations, and keyboard focus", () => {
  assert.match(component, /function badgeAssetPath/);
  assert.match(component, /\/badges\/\$\{assetName\}\.svg/);
  assert.match(component, /role="tooltip"/);
  assert.match(component, /tabIndex=\{0\}/);
  assert.match(component, /group-hover:opacity-100/);
  assert.match(component, /group-focus:opacity-100/);
  assert.match(component, /This user has a currently valid verified profile status\./);
  assert.match(component, /This user has completed at least 90% of their profile\./);
  assert.match(component, /This user has recorded at least 365 active days\./);
  assert.match(component, /This user has connected with at least 150 different penpals\./);
  assert.match(component, /This user has sent at least 100 Snail Mail letters that were delivered or read\./);
});

test("every implemented badge family has a matching full or icon asset", async () => {
  const keys = [...definitions.matchAll(/(?:"([a-z0-9-]+)"|([a-z]+)): \{ key: "(?:\1|\2)"/g)].map((match) => match[1] ?? match[2]);
  assert.ok(keys.length >= 88);
  for (const key of keys) {
    const suffix = key === "early-member" ? "icons" : "full";
    await readFile(new URL(`public/badges/${suffix}/${key}.svg`, root));
  }
});
