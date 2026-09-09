import { readProductionAppConfig } from "./production-app-config.mjs";

export class OwnerBootstrapError extends Error {}

function valueFrom(env, name) {
  return typeof env[name] === "string" ? env[name] : "";
}

export function normalizeOwnerEmail(value) {
  const email = String(value ?? "").trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (!email || /[\r\n\s]/.test(email) || at <= 0 || at === email.length - 1 || !email.slice(at + 1).includes(".")) {
    throw new OwnerBootstrapError("Enter a valid owner email address.");
  }
  return email;
}

export function readOwnerSetupConfig(env = process.env) {
  const appConfig = readProductionAppConfig(env);
  const databaseUrl = valueFrom(env, "PENPALS_DATABASE_URL");
  if (!databaseUrl) throw new OwnerBootstrapError("PENPALS_DATABASE_URL is required for first-owner setup.");
  if (databaseUrl !== databaseUrl.trim() || /[\r\n]/.test(databaseUrl)) {
    throw new OwnerBootstrapError("PENPALS_DATABASE_URL must not contain leading/trailing whitespace or line breaks.");
  }

  try {
    const url = new URL(databaseUrl);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.hash) {
      throw new Error("invalid PostgreSQL URL");
    }
  } catch {
    throw new OwnerBootstrapError("PENPALS_DATABASE_URL must be a valid private postgres:// or postgresql:// URL.");
  }

  return { ...appConfig, databaseUrl };
}

export async function ensureNoAdministrator(db) {
  const result = await db.query("select exists (select 1 from public.profiles where role = 'admin') as has_administrator");
  if (result.rows[0]?.has_administrator) {
    throw new OwnerBootstrapError("An administrator profile already exists. Use the authenticated admin tools instead of first-owner setup.");
  }
}

export async function findOwnerAccount(db, email) {
  const result = await db.query(
    "select id, email, email_confirmed_at from auth.users where lower(email) = lower($1) limit 1",
    [normalizeOwnerEmail(email)],
  );
  return result.rows[0] ?? null;
}

export async function getOwnerState(db, email, { lockProfile = false } = {}) {
  const normalizedEmail = normalizeOwnerEmail(email);
  const query = lockProfile
    ? `select p.id, u.email, u.email_confirmed_at, p.deactivated_at,
         coalesce(public.profile_entry_complete(p.id), false) as entry_complete,
         coalesce(public.is_adult_birth_date(p.birth_date), false) as adult
       from auth.users u
       join public.profiles p on p.id = u.id
       where lower(u.email) = lower($1)
       for update of p`
    : `select u.id, u.email, u.email_confirmed_at, p.id is not null as profile_exists,
         p.deactivated_at,
         coalesce(public.profile_entry_complete(p.id), false) as entry_complete,
         coalesce(public.is_adult_birth_date(p.birth_date), false) as adult
       from auth.users u
       left join public.profiles p on p.id = u.id
       where lower(u.email) = lower($1)`;
  const result = await db.query(query, [normalizedEmail]);
  return result.rows[0] ?? null;
}

export function assertOwnerReady(owner) {
  if (!owner) throw new OwnerBootstrapError("No profile exists for this owner account yet. Sign in and complete onboarding first.");
  if (!owner.email_confirmed_at) throw new OwnerBootstrapError("This owner account is not confirmed. Confirm it before first-owner setup can continue.");
  if (owner.deactivated_at) throw new OwnerBootstrapError("This owner profile is deactivated and cannot be promoted.");
  if (!owner.adult) throw new OwnerBootstrapError("This owner profile does not meet the existing age requirement.");
  if (!owner.entry_complete) throw new OwnerBootstrapError("Finish the required profile onboarding before first-owner setup can continue.");
}

export function assertPassword(password) {
  if (typeof password !== "string" || password.length < 8) {
    throw new OwnerBootstrapError("Choose a password with at least 8 characters.");
  }
  if (/[\r\n]/.test(password)) throw new OwnerBootstrapError("The owner password cannot contain a line break.");
}

export async function createOrFindOwner({ db, authAdmin, email, password }) {
  const normalizedEmail = normalizeOwnerEmail(email);
  await ensureNoAdministrator(db);
  const existing = await findOwnerAccount(db, normalizedEmail);
  if (existing) return { user: existing, created: false };

  assertPassword(password);
  const { data, error } = await authAdmin.createUser({
    email: normalizedEmail,
    password,
    // This is a direct, one-time trusted server-owner bootstrap. Ordinary
    // sign-up, verification, and recovery flows remain unchanged.
    email_confirm: true,
  });
  if (error || !data?.user) {
    throw new OwnerBootstrapError("The owner account could not be created. Check the private Supabase Auth configuration and try again.");
  }
  return { user: data.user, created: true };
}

export async function promoteFirstOwner(db, email) {
  let began = false;
  try {
    await db.query("BEGIN");
    began = true;
    await db.query("select pg_advisory_xact_lock(hashtextextended('penpal-admin-role-change', 0))");
    await ensureNoAdministrator(db);
    const owner = await getOwnerState(db, email, { lockProfile: true });
    assertOwnerReady(owner);
    await db.query("select set_config('app.allow_role_change', '1', true)");
    const update = await db.query("update public.profiles set role = 'admin' where id = $1 and role <> 'admin'", [owner.id]);
    if (update.rowCount !== 1) throw new OwnerBootstrapError("The owner role could not be updated.");
    await db.query("COMMIT");
    return owner;
  } catch (error) {
    if (began) {
      try {
        await db.query("ROLLBACK");
      } catch {
        // Preserve the original safe failure without exposing database details.
      }
    }
    if (error instanceof OwnerBootstrapError) throw error;
    throw new OwnerBootstrapError("First-owner setup stopped because the private database operation failed.");
  }
}
