import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = new URL("..", import.meta.url);
const script = new URL("scripts/validate-production-email-config.mjs", root);
const scriptPath = fileURLToPath(script);
const actions = await readFile(new URL("src/app/auth/actions.ts", root), "utf8");
const verificationServer = await readFile(new URL("src/lib/verification/server.ts", root), "utf8");
const readme = await readFile(new URL("README.md", root), "utf8");
const supabaseConfig = await readFile(new URL("supabase/config.toml", root), "utf8");
const syntheticResendKey = `re_${"x".repeat(28)}`;

const validEnvironment = {
  NODE_ENV: "production",
  NEXT_PUBLIC_SITE_URL: "https://penpal.example",
  NEXT_PUBLIC_SUPABASE_URL: "https://project-ref.supabase.co",
  SUPABASE_AUTH_CONFIRM_REDIRECT_URL: "https://penpal.example/auth/confirm",
  SUPABASE_AUTH_URI_ALLOW_LIST: "https://penpal.example/auth/confirm,https://penpal.example/auth/callback,https://penpal.example/auth/callback?mode=login,https://penpal.example/auth/callback?mode=link",
  SUPABASE_AUTH_SMTP_HOST: "smtp.resend.com",
  SUPABASE_AUTH_SMTP_PORT: "587",
  SUPABASE_AUTH_SMTP_USER: "resend",
  RESEND_API_KEY: syntheticResendKey,
  SUPABASE_AUTH_SMTP_ADMIN_EMAIL: "no-reply@pen-pals.net",
  SUPABASE_AUTH_SMTP_SENDER_NAME: "Pen-Pals",
};

function run(overrides = {}) {
  return spawnSync(process.execPath, [scriptPath], {
    encoding: "utf8",
    env: { ...process.env, ...validEnvironment, ...overrides },
  });
}

test("production email config passes with an exact HTTPS callback and complete SMTP settings", () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /configuration is valid/i);
  assert.ok(!`${result.stdout}\n${result.stderr}`.includes(syntheticResendKey));
});

test("production email config fails closed when site/callback/SMTP configuration is missing", () => {
  const result = run({
    NEXT_PUBLIC_SITE_URL: "",
    SUPABASE_AUTH_CONFIRM_REDIRECT_URL: "",
    SUPABASE_AUTH_SMTP_HOST: "",
    SUPABASE_AUTH_SMTP_PORT: "",
    SUPABASE_AUTH_SMTP_USER: "",
    RESEND_API_KEY: "",
    SUPABASE_AUTH_SMTP_ADMIN_EMAIL: "",
    SUPABASE_AUTH_SMTP_SENDER_NAME: "",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /NEXT_PUBLIC_SITE_URL is required/);
  assert.match(result.stderr, /SUPABASE_AUTH_SMTP_HOST is required/);
  assert.ok(!result.stderr.includes(syntheticResendKey));
});

test("production email config rejects local or mismatched callback origins", () => {
  const insecure = run({ NEXT_PUBLIC_SITE_URL: "http://localhost:3000" });
  assert.notEqual(insecure.status, 0);
  assert.match(insecure.stderr, /must use HTTPS|must not point to localhost/);

  const mismatched = run({ SUPABASE_AUTH_CONFIRM_REDIRECT_URL: "https://other.example/auth/confirm" });
  assert.notEqual(mismatched.status, 0);
  assert.match(mismatched.stderr, /must exactly equal NEXT_PUBLIC_SITE_URL\/auth\/confirm/);

  const malformed = run({ NEXT_PUBLIC_SITE_URL: "not-a-url" });
  assert.notEqual(malformed.status, 0);
  assert.match(malformed.stderr, /must be a valid URL/);
});

test("production email config requires exact production callbacks and sender identity", () => {
  const missingCallback = run({
    SUPABASE_AUTH_URI_ALLOW_LIST: "https://penpal.example/auth/confirm,https://penpal.example/auth/callback",
  });
  assert.notEqual(missingCallback.status, 0);
  assert.match(missingCallback.stderr, /auth\/callback\?mode=login/);

  const wildcard = run({ SUPABASE_AUTH_URI_ALLOW_LIST: "https://penpal.example/**" });
  assert.notEqual(wildcard.status, 0);
  assert.match(wildcard.stderr, /not wildcards/);

  const wrongSender = run({ SUPABASE_AUTH_SMTP_ADMIN_EMAIL: "noreply@pen-pals.net" });
  assert.notEqual(wrongSender.status, 0);
  assert.match(wrongSender.stderr, /must be no-reply@pen-pals\.net/);

  const publicSecretValue = `re_${"p".repeat(28)}`;
  const publicSecret = run({ NEXT_PUBLIC_RESEND_API_KEY: publicSecretValue });
  assert.notEqual(publicSecret.status, 0);
  assert.match(publicSecret.stderr, /must not expose/);
  assert.ok(!publicSecret.stderr.includes(publicSecretValue));
});

test("confirmation redirects cannot silently fall back to localhost in production", () => {
  assert.match(actions, /verificationSiteUrl\(\)/);
  assert.doesNotMatch(actions, /NEXT_PUBLIC_SITE_URL\?\?\s*["']http:\/\/localhost:3000/);
  assert.match(verificationServer, /Production site URL must use HTTPS/);
  assert.match(readme, /pnpm check:production-email/);
  assert.doesNotMatch(supabaseConfig, /https:\/\/(?:localhost|127\.0\.0\.1):3000/);
});

test("local development keeps its explicit HTTP callback behavior", () => {
  assert.match(verificationServer, /return "http:\/\/localhost:3000"/);
  assert.match(supabaseConfig, /site_url = "http:\/\/localhost:3000"/);
  assert.match(supabaseConfig, /additional_redirect_urls = \[[^\]]*"http:\/\/127\.0\.0\.1:3000\/auth\/confirm"/);
});
