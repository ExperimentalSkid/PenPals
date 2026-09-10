import fs from "node:fs";
import { execFileSync } from "node:child_process";

const SELF_HOSTED_ENV = "/opt/supabase/docker/.env";
const SELF_HOSTED_CONTAINER = "supabase-db";

function envFileValue(path, name) {
  if (!fs.existsSync(path)) return "";
  const line = fs.readFileSync(path, "utf8").split(/\r?\n/).find((entry) => entry.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim() ?? "";
}

export function resolveSchemaDatabaseUrl() {
  if (process.env.PENPALS_DATABASE_URL) return process.env.PENPALS_DATABASE_URL;

  try {
    execFileSync("docker", ["inspect", SELF_HOSTED_CONTAINER], { stdio: "ignore" });
    const password = envFileValue(SELF_HOSTED_ENV, "POSTGRES_PASSWORD");
    const database = envFileValue(SELF_HOSTED_ENV, "POSTGRES_DB") || "postgres";
    const host = execFileSync("docker", ["inspect", "-f", "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}", SELF_HOSTED_CONTAINER], { encoding: "utf8" }).trim();
    if (password && host) {
      return `postgresql://postgres:${encodeURIComponent(password)}@${host}:5432/${encodeURIComponent(database)}?sslmode=disable`;
    }
  } catch {
    // Fall through to the Supabase CLI local database.
  }

  return null;
}
