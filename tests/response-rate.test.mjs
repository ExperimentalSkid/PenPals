import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const sql = await readFile(new URL("../supabase/migrations/20260901040000_add_response_rate.sql", import.meta.url), "utf8");
function stats(opportunities, now) { const complete = opportunities.filter((o) => now - o.created >= 7 * 864e5 && !o.blocked); const answered = complete.filter((o) => o.response && o.response - o.created <= 7 * 864e5); const median = answered.map((o) => (o.response - o.created) / 36e5).sort((a, b) => a - b); return { count: complete.length, rate: complete.length >= 5 ? Math.round(answered.length * 100 / complete.length) : null, median: median.length ? median[Math.floor((median.length - 1) / 2)] : null }; }
test("answered introduction counts with median response time", () => assert.deepEqual(stats([{ created: 0, response: 2 * 864e5 }], 8 * 864e5), { count: 1, rate: null, median: 48 }));
test("unanswered introductions only complete after seven days", () => { assert.equal(stats([{ created: 0 }], 6 * 864e5).count, 0); assert.equal(stats([{ created: 0 }], 8 * 864e5).count, 1); });
test("blocked opportunity is excluded", () => assert.equal(stats([{ created: 0, blocked: true, response: 864e5 }], 8 * 864e5).count, 0));
test("duplicate messages remain one opportunity", () => assert.equal(stats([{ created: 0, response: 864e5, duplicateResponse: 2 * 864e5 }], 8 * 864e5).count, 1));
test("rate is withheld below five completed opportunities", () => assert.equal(stats(Array.from({ length: 4 }, (_, i) => ({ created: 0, response: (i + 1) * 864e5 })), 8 * 864e5).rate, null));
test("migration defines trigger, seven-day window, blocking, and median", () => { assert.match(sql, /record_first_response/); assert.match(sql, /interval '7 days'/); assert.match(sql, /percentile_cont\(0\.5\)/); assert.match(sql, /profile_blocks/); });
