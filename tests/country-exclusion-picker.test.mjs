import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const countries = await readFile(new URL("src/lib/countries.ts", root), "utf8");
const picker = await readFile(new URL("src/app/app/settings/CountryExclusionPicker.tsx", root), "utf8");
const locationEditor = await readFile(new URL("src/app/app/profile/setup/LocationEditor.tsx", root), "utf8");
const searchList = await readFile(new URL("src/app/app/shared/InlineSearchList.tsx", root), "utf8");
const flag = await readFile(new URL("src/app/components/CountryFlag.tsx", root), "utf8");
const globals = await readFile(new URL("src/app/globals.css", root), "utf8");

function pickerHarness(catalogue, initialSelected) {
  let selected;
  const testModule = { exports: {} };
  const inlineSearch = () => null;
  const jsx = (type, props) => ({ type, props });
  const code = ts.transpileModule(picker, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  vm.runInNewContext(code, {
    module: testModule, exports: testModule.exports,
    require(name) {
      if (name === "react") return { useState(initial) {
        selected ??= initial;
        return [selected, (update) => { selected = update(selected); }];
      } };
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "next-intl") return { useTranslations: () => (key, values = {}) => key === "app.settings.removeCountry" ? `Remove ${values.name}` : key === "app.settings.remove" ? "Remove" : key };
      if (name === "../shared/InlineSearchList") return { default: inlineSearch };
      if (name === "@/app/components/CountryFlag") return { default: () => null };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  return () => {
    const elements = [];
    function visit(node) {
      if (Array.isArray(node)) return node.forEach(visit);
      if (!node || typeof node !== "object") return;
      elements.push(node);
      visit(node.props?.children);
    }
    visit(testModule.exports.default({ countries: catalogue, initialSelected }));
    return {
      search: elements.find((node) => node.type === inlineSearch).props,
      buttons: elements.filter((node) => node.type === "button").map((node) => node.props),
      codes: elements.filter((node) => node.type === "input").map((node) => node.props.value),
    };
  };
}

test("privacy exclusions use the complete canonical country catalogue", () => {
  const codes = countries.match(/const COUNTRY_CODES = `([\s\S]*?)`\.trim\(\)/)?.[1]?.trim().split(/\s+/) ?? [];
  assert.equal(codes.length, 249);
  for (const code of ["TR", "NO", "US", "AR", "JP", "ZA"]) assert.ok(codes.includes(code), `missing ${code}`);
  assert.match(countries, /TR:\s*\["Turkey"\]/);
  assert.match(picker, /options=\{countries\.map\([\s\S]*searchAliases: country\.aliases/);
  assert.match(picker, /<CountryFlag code=\{option\.value\}/);
  assert.match(picker, /name="excluded_countries"/);
});

test("profile location search and privacy search share accent-insensitive aliases", () => {
  assert.match(locationEditor, /searchAliases: option\.aliases/);
  assert.match(searchList, /normalize\("NFD"\)/);
  assert.match(searchList, /option\.searchAliases/);
  assert.match(flag, /country-flag-icons/);
  assert.match(flag, /className={`flag:\$\{normalized\}`}/);
  assert.match(globals, /country-flag-icons\/3x2\/flags\.css/);
});

test("every canonical country code has a shared flag asset", async () => {
  const codes = countries.match(/const COUNTRY_CODES = `([\s\S]*?)`\.trim\(\)/)?.[1]?.trim().split(/\s+/) ?? [];
  const flagRoot = fileURLToPath(new URL("../node_modules/country-flag-icons/3x2/", import.meta.url));
  await Promise.all(codes.map((code) => access(join(flagRoot, `${code}.svg`))));
});

test("settings country search does not steal initial focus from the page", () => {
  const render = pickerHarness([], []);
  assert.equal(render().search.autoFocus, false);
  assert.match(searchList, /autoFocus = true/); // Other conditional pickers retain their existing focus behavior.
});

test("country removal has a specific accessible name and preserves canonical selections", () => {
  const render = pickerHarness([
    { code: "NO", name: "Norway" },
    { code: "JP", name: "Japan" },
  ], ["NO", "JP", "XX"]);
  let view = render();
  assert.deepEqual(view.buttons.map((button) => button["aria-label"]), ["Remove Norway", "Remove Japan", "Remove XX"]);
  assert.ok(view.buttons.every((button) => button.children === "Remove"));
  assert.deepEqual(view.codes, ["NO", "JP", "XX"]);
  view.search.onSelect({ value: "NO", label: "Norway" });
  assert.deepEqual(render().codes, ["NO", "JP", "XX"]);
  view.buttons[0].onClick();
  view = render();
  assert.deepEqual(view.codes, ["JP", "XX"]);
  view.search.onSelect({ value: "NO", label: "Norway" });
  assert.deepEqual(render().codes, ["JP", "XX", "NO"]);
});
