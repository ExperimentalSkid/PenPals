import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Keep the CLI version explicit so local and CI validation use the same binary.
export const SUPABASE_CLI_VERSION = "2.116.0";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
export const REPOSITORY_ROOT = path.resolve(scriptsDirectory, "..");

const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function commandAndArgs(args) {
  if (process.platform !== "win32") {
    return { command: pnpmCommand, args };
  }

  // Spawning a .cmd shim directly returns EINVAL on Windows. Invoke cmd.exe
  // explicitly; all arguments are fixed CLI flags or repository paths.
  return {
    command: process.env.ComSpec ?? "cmd.exe",
    args: ["/d", "/s", "/c", pnpmCommand, ...args],
  };
}

/**
 * Run the pinned Supabase CLI from the repository root.
 *
 * The CLI is fetched ephemerally by pnpm; no global install or generated
 * credential is needed. Callers may use `stdio: "pipe"` when they need to
 * inspect machine-readable output.
 */
export function runSupabase(args, options = {}) {
  const invocation = commandAndArgs([
    "dlx",
    "--yes",
    `--package=supabase@${SUPABASE_CLI_VERSION}`,
    "supabase",
    ...args,
  ]);

  return spawnSync(
    invocation.command,
    invocation.args,
    {
      cwd: REPOSITORY_ROOT,
      encoding: "utf8",
      windowsHide: true,
      ...options,
    },
  );
}
