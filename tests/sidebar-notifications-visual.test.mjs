import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const navigation = await readFile(new URL("../src/app/app/AppNavigation.tsx", import.meta.url), "utf8");
const layout = await readFile(new URL("../src/app/app/layout.tsx", import.meta.url), "utf8");
const notifications = await readFile(new URL("../src/app/app/notifications/page.tsx", import.meta.url), "utf8");

test("app navigation has accessible grouped links and role-gated real count badges", () => {
  for (const label of ["Discover", "Introductions", "Messages", "Notifications", "Settings", "Admin", "Mod Inbox", "Profile"]) assert.match(navigation, new RegExp(label));
  assert.match(navigation, /usePathname/);
  assert.match(navigation, /aria-current=\{active \? "page"/);
  assert.match(navigation, /unread notifications/);
  assert.match(navigation, /open moderation cases/);
  assert.match(navigation, /role === "admin" \|\| role === "moderator"/);
});

test("the shell reads server-authoritative notification and moderation queue counts", () => {
  assert.match(layout, /unread_notification_count/);
  assert.match(layout, /admin_dashboard_summary/);
  assert.match(layout, /new_cases.*triage_cases.*investigating_cases.*waiting_cases/s);
});

test("notification presentation keeps the existing stream and adds a consistent bell treatment", () => {
  assert.match(notifications, /NotificationIcon name="bell"/);
  assert.match(notifications, /ACTIVE_TYPES/);
  assert.doesNotMatch(notifications, /ACTIVE_TYPES = \[[^\]]*new_message/);
  assert.match(notifications, /role="alert"/);
});

