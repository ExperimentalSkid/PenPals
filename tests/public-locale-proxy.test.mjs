import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const proxy = await readFile(new URL("../src/proxy.ts", import.meta.url), "utf8");

test("Spanish public rewrites do not bounce back into the locale redirect", () => {
  assert.match(proxy, /requestHeaders\.set\("x-penpals-locale", "es"\)/);
  assert.match(proxy, /request\.headers\.get\("x-penpals-locale"\) === "es"\) return NextResponse\.next\(\)/);
  const markerGuard = proxy.indexOf('request.headers.get("x-penpals-locale") === "es"');
  const cookieRedirect = proxy.indexOf('request.cookies.get("NEXT_LOCALE")?.value === "es"');
  assert.ok(markerGuard >= 0 && cookieRedirect > markerGuard, "rewrite marker must be checked before the locale cookie redirect");
});

test("contact remains in the localized public route set", () => {
  for (const route of ["/", "/faq", "/privacy", "/terms", "/contact"]) assert.match(proxy, new RegExp(`"${route.replaceAll("/", "\\/")}"`));
});
