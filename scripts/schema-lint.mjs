import { runSupabase, REPOSITORY_ROOT, SUPABASE_CLI_VERSION } from "./supabase-cli.mjs";

const result = runSupabase([
  "db",
  "lint",
  "--local",
  // Intentional INFO/warning findings remain visible without blocking a release.
  "--fail-on",
  "error",
  "--workdir",
  REPOSITORY_ROOT,
], { stdio: "inherit" });

if (result.error) {
  console.error(`Unable to run Supabase CLI ${SUPABASE_CLI_VERSION}: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
