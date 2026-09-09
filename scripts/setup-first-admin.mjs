#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { createInterface } from "node:readline/promises";
import {
  OwnerBootstrapError,
  createOrFindOwner,
  ensureNoAdministrator,
  getOwnerState,
  normalizeOwnerEmail,
  promoteFirstOwner,
  readOwnerSetupConfig,
  assertOwnerReady,
} from "./first-admin-bootstrap.mjs";

function ensureInteractiveTerminal() {
  if (!process.stdin.isTTY || !process.stdout.isTTY || typeof process.stdin.setRawMode !== "function") {
    throw new OwnerBootstrapError("First-owner setup must run from an interactive terminal; it will not run in CI, a build, or a redirected shell.");
  }
}

async function ask(prompt) {
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await readline.question(prompt);
  } finally {
    readline.close();
  }
}

async function askPassword(prompt) {
  ensureInteractiveTerminal();
  process.stdout.write(prompt);
  const wasRaw = process.stdin.isRaw;
  process.stdin.setRawMode(true);
  process.stdin.resume();

  return await new Promise((resolve, reject) => {
    let password = "";
    const cleanup = () => {
      process.stdin.off("data", onData);
      process.stdin.setRawMode(Boolean(wasRaw));
      process.stdin.pause();
    };
    const cancel = () => {
      cleanup();
      process.stdout.write("\n");
      reject(new OwnerBootstrapError("First-owner setup cancelled."));
    };
    const finish = () => {
      cleanup();
      process.stdout.write("\n");
      resolve(password);
    };
    const onData = (buffer) => {
      for (const character of buffer.toString("utf8")) {
        if (character === "\u0003") return cancel();
        if (character === "\r" || character === "\n") return finish();
        if (character === "\b" || character === "\u007f") {
          if (password.length) {
            password = password.slice(0, -1);
            process.stdout.write("\b \b");
          }
          continue;
        }
        if (character >= " " && character !== "\u007f") {
          password += character;
          process.stdout.write("*");
        }
      }
    };
    process.stdin.on("data", onData);
  });
}

async function waitForCompletedOnboarding(db, email, siteUrl) {
  process.stdout.write(`\nOpen ${siteUrl}/sign-in in a browser, sign in as the owner, and complete the normal onboarding flow.\n`);
  process.stdout.write("The account will not be promoted until its confirmed, active profile meets the existing entry requirements.\n");
  while (true) {
    await ask("Press Enter after completing onboarding (Ctrl+C cancels): ");
    try {
      assertOwnerReady(await getOwnerState(db, email));
      return;
    } catch (error) {
      if (!(error instanceof OwnerBootstrapError)) throw error;
      process.stdout.write(`${error.message}\n`);
    }
  }
}

async function main() {
  ensureInteractiveTerminal();
  const config = readOwnerSetupConfig();
  const db = new Client({ connectionString: config.databaseUrl });
  try {
    try {
      await db.connect();
    } catch {
      throw new OwnerBootstrapError("Could not connect to the private PostgreSQL database. Check PENPALS_DATABASE_URL and database availability.");
    }

    await ensureNoAdministrator(db);
    const email = normalizeOwnerEmail(await ask("Owner email: "));
    const existing = await getOwnerState(db, email);
    let setupResult;
    if (existing) {
      setupResult = { created: false };
      process.stdout.write("An existing owner account was found. Its password and confirmation state will not be changed.\n");
    } else {
      const password = await askPassword("Owner password (hidden): ");
      const confirmation = await askPassword("Confirm owner password: ");
      if (password !== confirmation) throw new OwnerBootstrapError("The two passwords do not match.");
      const supabase = createClient(config.supabaseUrl, config.serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      });
      setupResult = await createOrFindOwner({ db, authAdmin: supabase.auth.admin, email, password });
    }

    if (setupResult.created) {
      process.stdout.write("A confirmed owner account was created through Supabase Auth. The installer did not print or retain its password.\n");
    }
    await waitForCompletedOnboarding(db, email, config.siteUrl);
    await promoteFirstOwner(db, email);
    process.stdout.write("First administrator provisioned. Sign out and sign in again before opening the admin area.\n");
  } finally {
    await db.end().catch(() => {});
  }
}

main().catch((error) => {
  if (error instanceof OwnerBootstrapError) {
    console.error(`First-owner setup stopped: ${error.message}`);
  } else {
    console.error("First-owner setup stopped unexpectedly. Check the private deployment configuration and try again.");
  }
  process.exitCode = 1;
});
