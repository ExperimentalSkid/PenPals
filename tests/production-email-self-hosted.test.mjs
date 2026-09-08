import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";

const root = new URL("../", import.meta.url);
const [overlay, example] = await Promise.all([
  readFile(new URL("deploy/supabase/docker-compose.auth-email.yml", root), "utf8"),
  readFile(new URL("deploy/supabase/.env.email.example", root), "utf8"),
]);
const settings = parseEnv(example);
const authEnvironment = Object.fromEntries(Array.from(
  overlay.matchAll(/^      (GOTRUE_[A-Z_]+): (".*")$/gm),
  ([, key, value]) => [key, JSON.parse(value)],
));
const templateService = overlay.split(/^  penpals-auth-templates:\s*$/m)[1];
const flows = {
  CONFIRMATION: ["confirmation.html", "Confirm your Pen-Pals email"],
  RECOVERY: ["recovery.html", "Reset your Pen-Pals password"],
  INVITE: ["invite.html", "Your Pen-Pals invitation"],
  MAGIC_LINK: ["magic-link.html", "Your Pen-Pals sign-in link"],
  EMAIL_CHANGE: ["email-change.html", "Confirm your new Pen-Pals email"],
  REAUTHENTICATION: ["reauthentication.html", "Your Pen-Pals confirmation code"],
};

test("the overlay extends the official auth service without replacing the Supabase stack", () => {
  assert.deepEqual(Array.from(overlay.matchAll(/^  ([a-z][a-z0-9-]+):\s*$/gm), ([, name]) => name), ["auth", "penpals-auth-templates"]);
  assert.match(overlay, /auth:\s+depends_on:\s+penpals-auth-templates:\s+condition: service_started/);
  assert.doesNotMatch(overlay, /GOTRUE_(?:DB|JWT|EXTERNAL|SECURITY|RATE_LIMIT|HOOK)_|API_EXTERNAL_URL:/);
  assert.equal(authEnvironment.GOTRUE_MAILER_AUTOCONFIRM, "false");
  assert.equal(authEnvironment.GOTRUE_SITE_URL, "${NEXT_PUBLIC_SITE_URL:?Set the production HTTPS site origin}");
  assert.equal(authEnvironment.GOTRUE_URI_ALLOW_LIST, "${SUPABASE_AUTH_URI_ALLOW_LIST:?Set the full production redirect allow-list}");
});

test("Auth uses Resend SMTP and reads its password only from the private deployment environment", () => {
  assert.equal(authEnvironment.GOTRUE_SMTP_HOST, "smtp.resend.com");
  assert.equal(authEnvironment.GOTRUE_SMTP_USER, "resend");
  assert.equal(authEnvironment.GOTRUE_SMTP_PORT, "${SUPABASE_AUTH_SMTP_PORT:-465}");
  assert.equal(authEnvironment.GOTRUE_SMTP_PASS, "${RESEND_API_KEY:?Set the Resend API key in the VPS secret environment}");
  assert.equal(authEnvironment.GOTRUE_SMTP_ADMIN_EMAIL, "${SUPABASE_AUTH_SMTP_ADMIN_EMAIL:?Set a sender on the verified Resend domain}");
  assert.equal(authEnvironment.GOTRUE_SMTP_SENDER_NAME, "${SUPABASE_AUTH_SMTP_SENDER_NAME:-Pen-Pals}");
  assert.equal(settings.RESEND_API_KEY, "");
  assert.doesNotMatch(`${overlay}\n${example}`, /\bre_[A-Za-z0-9]{10,}|\bsbp_[A-Za-z0-9]{10,}|NEXT_PUBLIC_(?:RESEND|SMTP)/);
});

test("all six GoTrue template URLs point to existing production HTML and the correct subjects", async () => {
  assert.equal(Object.keys(authEnvironment).filter((key) => key.startsWith("GOTRUE_MAILER_TEMPLATES_")).length, 6);
  assert.equal(Object.keys(authEnvironment).filter((key) => key.startsWith("GOTRUE_MAILER_SUBJECTS_")).length, 6);
  for (const [flow, [file, subject]] of Object.entries(flows)) {
    const url = new URL(authEnvironment[`GOTRUE_MAILER_TEMPLATES_${flow}`]);
    assert.equal(url.origin, "http://penpals-auth-templates:8080");
    assert.equal(url.pathname, `/${file}`);
    assert.equal(url.search, "");
    assert.equal(authEnvironment[`GOTRUE_MAILER_SUBJECTS_${flow}`], subject);
    const html = await readFile(new URL(`supabase/templates/production/${file}`, root), "utf8");
    assert.match(html, /<!doctype html>/i);
    assert.match(html, /Pen-Pals/);
  }
});

test("Caddy serves raw templates privately with no published ports or template evaluation", () => {
  assert.ok(templateService);
  assert.match(templateService, /image: caddy:2-alpine/);
  const command = JSON.parse(templateService.match(/^    command: (\[.*\])$/m)[1]);
  assert.deepEqual(command, ["caddy", "file-server", "--root", "/templates", "--listen", ":8080"]);
  assert.doesNotMatch(overlay, /^\s*(?:ports|network_mode):|--templates|--browse/m);
});

test("the template volume is a read-only bind from the required absolute repository checkout", () => {
  assert.match(templateService, /type: bind/);
  const source = JSON.parse(templateService.match(/^        source: (".*")$/m)[1]);
  assert.equal(source, "${PENPALS_REPOSITORY_PATH:?Set the absolute VPS repository path}/supabase/templates/production");
  assert.match(templateService, /target: \/templates/);
  assert.match(templateService, /read_only: true/);
  assert.match(templateService, /create_host_path: false/);
  assert.match(settings.PENPALS_REPOSITORY_PATH, /^\/(?!\/)/);
  assert.equal((templateService.match(/type: bind/g) ?? []).length, 1);
});

test("the example uses pen-pals.net and exact callbacks without guessing the Supabase API origin", () => {
  assert.equal(settings.NEXT_PUBLIC_SITE_URL, "https://pen-pals.net");
  assert.equal(settings.NEXT_PUBLIC_SUPABASE_URL, "");
  assert.equal(settings.SUPABASE_AUTH_CONFIRM_REDIRECT_URL, "https://pen-pals.net/auth/confirm");
  assert.equal(settings.SUPABASE_AUTH_SMTP_HOST, "smtp.resend.com");
  assert.equal(settings.SUPABASE_AUTH_SMTP_USER, "resend");
  assert.equal(settings.SUPABASE_AUTH_SMTP_ADMIN_EMAIL, "no-reply@pen-pals.net");
  assert.deepEqual(settings.SUPABASE_AUTH_URI_ALLOW_LIST.split(","), [
    "https://pen-pals.net/auth/confirm",
    "https://pen-pals.net/auth/callback",
    "https://pen-pals.net/auth/callback?mode=login",
    "https://pen-pals.net/auth/callback?mode=link",
  ]);
  for (const name of ["API_EXTERNAL_URL", "SUPABASE_PUBLIC_URL", "SUPABASE_ACCESS_TOKEN", "SUPABASE_PROJECT_REF"]) {
    assert.equal(Object.hasOwn(settings, name), false, `${name} must come from the existing VPS configuration if needed`);
  }
  assert.doesNotMatch(`${overlay}\n${example}`, /localhost|127\.0\.0\.1|pen-pals\.com\b|supabase\.co\b/);
});
