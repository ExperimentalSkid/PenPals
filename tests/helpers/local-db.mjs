import { execFileSync } from "node:child_process";

const configured = process.env.PENPALS_TEST_DB_CONTAINER?.trim();
const candidates = [configured, "supabase_db_Penpal", "supabase-db"].filter(Boolean);

export function resolveLocalDbContainer() {
  for (const name of [...new Set(candidates)]) {
    try {
      const running = execFileSync("docker", ["inspect", "--format", "{{.State.Running}}", name], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (running === "true") return name;
    } catch {
      // Try the next known local Supabase database container name.
    }
  }
  return null;
}

export const LOCAL_DB_CONTAINER = resolveLocalDbContainer();
export const HAS_LOCAL_DB = Boolean(LOCAL_DB_CONTAINER);
