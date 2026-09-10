import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../src/app/app/notifications/page.tsx", import.meta.url), "utf8");

test("every active notification type has an actionable destination", () => {
  assert.match(page, /new_introduction/);
  assert.match(page, /introduction_replied/);
  assert.match(page, /introduction_declined/);
  assert.match(page, /photo_access_request/);
  assert.match(page, /photo_access_granted/);
  assert.match(page, /introduction_declined[\s\S]*app\.notifications\.introDeclined[\s\S]*app\.notifications\.openIntroductions/);
  assert.doesNotMatch(page, /ACTIVE_TYPES = \[[^\]]*new_message/);
});

test("notification actions resolve introductions and photo requests to real destinations", () => {
  assert.match(page, /destination = introduction\?\.conversation_id_legacy \? `\/app\/messages\/\$\{introduction\.conversation_id_legacy\}` : "\/app\/introductions"/);
  assert.match(page, /from\("profile_photo_access_requests"\)/);
  assert.match(page, /destination = request\?\.conversation_id \? `\/app\/messages\/\$\{request\.conversation_id\}`/);
});

test("opening an action marks only the owned unread row and exposes failures", () => {
  assert.match(page, /\.eq\("id", notificationId\)/);
  assert.match(page, /\.eq\("user_id", uid\)/);
  assert.match(page, /\.update\(\{ read_at: new Date\(\)\.toISOString\(\) \}\)/);
  assert.match(page, /\.is\("read_at", null\)/);
  assert.match(page, /const errorMessage = first\(params\.error\)/);
  assert.match(page, /role="alert"/);
  assert.match(page, /openNotification\.bind\(null, notification\.id\)/);
  assert.match(page, /revalidatePath\("\/app", "layout"\)/);
});

test("message notifications remain excluded from this action surface", () => {
  assert.match(page, /Message events intentionally remain outside this list/);
  assert.match(page, /if \(!ACTIVE_TYPES\.includes\(notification\.type\)\) redirect/);
  assert.doesNotMatch(page, /notification\.type === "new_message"/);
  assert.match(page, /\.in\("type", ACTIVE_TYPES\)/);
});


test("notification action routing surfaces authorization and destination lookup failures", () => {
  assert.match(page, /error: staffCheckError/);
  assert.match(page, /if \(staffCheckError\) throw staffCheckError/);
  assert.match(page, /error: requestError/);
  assert.match(page, /if \(requestError\) throw requestError/);
  assert.match(page, /error: introductionLookupError/);
  assert.match(page, /if \(introductionLookupError\) throw introductionLookupError/);
});


test("notification destinations are resolved before the notification is consumed", () => {
  const lookup = page.indexOf('const { data: request, error: requestError }');
  const readBlock = page.indexOf('const { error: readError }', page.indexOf('async function openNotification'));
  assert.ok(lookup >= 0 && readBlock > lookup);
  assert.match(page, /let destination = "\/app\/notifications"/);
  assert.match(page, /redirect\(destination\)/);
});
