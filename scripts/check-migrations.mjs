import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { REPOSITORY_ROOT, runSupabase, SUPABASE_CLI_VERSION } from "./supabase-cli.mjs";

const migrationsDirectory = path.join(REPOSITORY_ROOT, "supabase", "migrations");
const migrationFilename = /^(\d{14})_([a-z0-9][a-z0-9_-]*)\.sql$/;
const checkLocalDatabase = process.argv.slice(2).includes("--local");

function fail(message) {
  console.error(`Migration check failed: ${message}`);
  process.exitCode = 1;
}

const entries = await fs.readdir(migrationsDirectory, { withFileTypes: true });
const files = entries
  .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
  .map((entry) => entry.name);

if (files.length === 0) {
  fail("no SQL migrations were found in supabase/migrations");
  process.exit(1);
}

const parsed = [];
for (const file of files) {
  const match = migrationFilename.exec(file);
  if (!match) {
    fail(`${file} must use <14-digit-version>_<lowercase-name>.sql`);
    continue;
  }
  parsed.push({ file, version: match[1] });
}

const byVersion = new Map();
for (const migration of parsed) {
  const existing = byVersion.get(migration.version);
  if (existing) {
    fail(`duplicate migration version ${migration.version}: ${existing} and ${migration.file}`);
  } else {
    byVersion.set(migration.version, migration.file);
  }
}

const orderedFiles = [...files].sort();
const orderedVersions = [...parsed].sort((a, b) => a.version.localeCompare(b.version));
if (orderedFiles.length !== parsed.length) {
  process.exit(1);
}

// The version prefix is the migration order. This check makes the ordering
// deterministic and rejects duplicate/nonconforming entries before CI starts
// a database, where a failure would otherwise be harder to diagnose.
for (let index = 1; index < orderedVersions.length; index += 1) {
  if (orderedVersions[index - 1].version >= orderedVersions[index].version) {
    fail(`migration versions are not strictly increasing near ${orderedVersions[index].version}`);
  }
}

if (process.exitCode) {
  process.exit(1);
}

console.log(`Migration filenames: ${parsed.length} valid, unique, and deterministically ordered.`);

if (!checkLocalDatabase) {
  console.log("Local history parity check skipped (pass --local after the local Supabase database is running).");
  process.exit(0);
}

const result = runSupabase([
  "migration",
  "list",
  "--local",
  "--output-format",
  "json",
  "--workdir",
  REPOSITORY_ROOT,
], { stdio: "pipe" });

if (result.error) {
  fail(`unable to run Supabase CLI ${SUPABASE_CLI_VERSION}: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  const details = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  fail(`supabase migration list --local exited with ${result.status}${details ? `: ${details}` : ""}`);
  process.exit(result.status ?? 1);
}

const output = String(result.stdout ?? "");
const jsonStart = output.indexOf("{");
const jsonEnd = output.lastIndexOf("}");
if (jsonStart < 0 || jsonEnd <= jsonStart) {
  fail("Supabase CLI did not return JSON migration history");
  process.exit(1);
}

let history;
try {
  history = JSON.parse(output.slice(jsonStart, jsonEnd + 1));
} catch (error) {
  fail(`could not parse Supabase migration history JSON: ${error.message}`);
  process.exit(1);
}

const rows = Array.isArray(history?.migrations) ? history.migrations : null;
if (!rows) {
  fail("Supabase migration history JSON did not include a migrations array");
  process.exit(1);
}

const expectedVersions = [...byVersion.keys()].sort();
const historyOrder = rows.map((row) => row.remote ?? row.local).filter(Boolean);
const localVersions = rows.map((row) => row.local).filter(Boolean).sort();
const remoteVersions = rows.map((row) => row.remote).filter(Boolean).sort();

const sameVersions = (left, right) =>
  left.length === right.length && left.every((version, index) => version === right[index]);

if (!sameVersions(localVersions, expectedVersions)) {
  fail(`local migration history does not match files (expected ${expectedVersions.length}, applied ${localVersions.length})`);
}

if (!sameVersions(remoteVersions, expectedVersions)) {
  fail(`migration parity mismatch (local files ${expectedVersions.length}, database history ${remoteVersions.length})`);
}

if (!sameVersions(historyOrder, expectedVersions)) {
  fail("database migration history is not in the same order as the migration files");
}

const divergentRows = rows.filter((row) => row.local !== row.remote);
if (divergentRows.length > 0) {
  const versions = divergentRows
    .map((row) => `${row.local ?? "<missing>"}/${row.remote ?? "<missing>"}`)
    .join(", ");
  fail(`local/remote migration entries diverge: ${versions}`);
}

if (process.exitCode) {
  process.exit(1);
}

console.log(`Local migration history: ${expectedVersions.length} applied with no parity or ordering drift.`);
