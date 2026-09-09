export class ProductionAppConfigurationError extends Error {}

function valueFrom(env, name) {
  return typeof env[name] === "string" ? env[name] : "";
}

function requiredValue(env, name, errors) {
  const value = valueFrom(env, name);
  if (!value) {
    errors.push(`${name} is required`);
    return "";
  }
  if (value !== value.trim() || /[\r\n]/.test(value)) {
    errors.push(`${name} must not contain leading/trailing whitespace or line breaks`);
  }
  return value;
}

function productionOrigin(value, name, errors) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") errors.push(`${name} must use HTTPS in production`);
    if (["localhost", "[::1]", "::1", "0.0.0.0"].includes(url.hostname) || /^127\./.test(url.hostname) || url.hostname.endsWith(".localhost")) {
      errors.push(`${name} must not point to localhost in production`);
    }
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      errors.push(`${name} must be an origin without credentials, a path, query, or fragment`);
    }
    return url;
  } catch {
    errors.push(`${name} must be a valid URL`);
    return null;
  }
}

function validEmailAddress(value) {
  return /^[^\s<>@]+@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(value);
}

function validateSenderIdentity(value, name, errors) {
  if (!value) return;
  if (value !== value.trim() || /[\r\n]/.test(value)) {
    errors.push(`${name} must not contain leading/trailing whitespace or line breaks`);
    return;
  }
  const clean = (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))
    ? value.slice(1, -1).trim()
    : value;
  const addressMatch = /^(.+?)\s*<([^<>]+)>$/.exec(clean);
  const address = addressMatch ? addressMatch[2].trim() : clean;
  if (!validEmailAddress(address)) {
    errors.push(`${name} must be an email address or a friendly sender such as Pen-Pals <no-reply@pen-pals.net>`);
  }
}

export function readProductionAppConfig(env = process.env) {
  const errors = [];
  const siteUrl = requiredValue(env, "NEXT_PUBLIC_SITE_URL", errors);
  const supabaseUrl = requiredValue(env, "NEXT_PUBLIC_SUPABASE_URL", errors);
  const publishableKey = requiredValue(env, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", errors);
  const serviceRoleKey = requiredValue(env, "SUPABASE_SERVICE_ROLE_KEY", errors);
  const resendApiKey = valueFrom(env, "RESEND_API_KEY");

  const site = siteUrl ? productionOrigin(siteUrl, "NEXT_PUBLIC_SITE_URL", errors) : null;
  const supabase = supabaseUrl ? productionOrigin(supabaseUrl, "NEXT_PUBLIC_SUPABASE_URL", errors) : null;
  if (publishableKey && serviceRoleKey && publishableKey === serviceRoleKey) {
    errors.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SERVICE_ROLE_KEY must be distinct");
  }
  if (resendApiKey && (resendApiKey !== resendApiKey.trim() || /[\r\n]/.test(resendApiKey) || !/^re_[A-Za-z0-9_]{20,}$/.test(resendApiKey))) {
    errors.push("RESEND_API_KEY must have the expected Resend key format");
  }
  validateSenderIdentity(valueFrom(env, "SUPPORT_EMAIL_FROM"), "SUPPORT_EMAIL_FROM", errors);
  validateSenderIdentity(valueFrom(env, "SUPPORT_EMAIL_REPLY_TO"), "SUPPORT_EMAIL_REPLY_TO", errors);

  for (const [name, rawValue] of Object.entries(env)) {
    if (!name.startsWith("NEXT_PUBLIC_") || !rawValue?.trim()) continue;
    if (/(?:RESEND|SMTP|SERVICE_ROLE|SECRET|PASSWORD|PRIVATE_KEY|ACCESS_TOKEN)/.test(name)) {
      errors.push(`${name} must not expose a server-only credential`);
    }
  }

  const googleStateSecret = valueFrom(env, "GOOGLE_LOGIN_STATE_SECRET");
  if (googleStateSecret) {
    if (googleStateSecret !== googleStateSecret.trim() || /[\r\n]/.test(googleStateSecret) || googleStateSecret.length < 32) {
      errors.push("GOOGLE_LOGIN_STATE_SECRET must be at least 32 characters with no leading/trailing whitespace or line breaks when Google linking is enabled");
    }
  }

  const requestedBatchSize = valueFrom(env, "BACKGROUND_JOB_BATCH_SIZE");
  if (requestedBatchSize && (!/^[1-9]\d*$/.test(requestedBatchSize) || Number(requestedBatchSize) > 500)) {
    errors.push("BACKGROUND_JOB_BATCH_SIZE must be an integer from 1 to 500 when set");
  }

  if (errors.length) throw new ProductionAppConfigurationError(errors.join("\n"));
  return {
    siteUrl: site?.origin,
    supabaseUrl: supabase?.origin,
    publishableKey,
    serviceRoleKey,
  };
}
