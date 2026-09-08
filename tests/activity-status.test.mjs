import test from "node:test";
import assert from "node:assert/strict";
function status(last, now) { if (!last) return "Active more than a week ago"; const d = now - last; if (d < 5 * 60_000) return "Online now"; if (d < 60 * 60_000) return "Active recently"; if (d < 24 * 60 * 60_000) return "Active today"; if (d < 7 * 24 * 60 * 60_000) return "Active this week"; return "Active more than a week ago"; }
const now = Date.now();
test("activity status uses coarse windows", () => { assert.equal(status(now - 60_000, now), "Online now"); assert.equal(status(now - 30 * 60_000, now), "Active recently"); assert.equal(status(now - 3 * 60 * 60_000, now), "Active today"); assert.equal(status(now - 3 * 864e5, now), "Active this week"); assert.equal(status(now - 10 * 864e5, now), "Active more than a week ago"); });
test("missing activity is not exposed as online", () => assert.equal(status(null, now), "Active more than a week ago"));
