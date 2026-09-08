export class EmailConfigurationError extends Error {}

function httpsUrl(value, name, errors, originOnly = false) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") errors.push(`${name} must use HTTPS in production`);
    if (url.hostname === "localhost" || url.hostname.endsWith(".localhost")
        || ["[::1]", "0.0.0.0"].includes(url.hostname) || /^127\./.test(url.hostname)) {
      errors.push(`${name} must not point to localhost in production`);
    }
    if (url.username || url.password || url.hash || (originOnly && (url.pathname !== "/" || url.search))) {
      errors.push(`${name} must not contain credentials, a fragment, or an unexpected path/query`);
    }
    return url;
  } catch {
    errors.push(`${name} must be a valid URL`);
    return null;
  }
}

export function readProductionEmailConfig(env = process.env) {
  const value = (name) => env[name]?.trim() ?? "";
  const errors = [];
  const required = ["NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_AUTH_CONFIRM_REDIRECT_URL", "SUPABASE_AUTH_SMTP_HOST",
    "SUPABASE_AUTH_SMTP_PORT", "SUPABASE_AUTH_SMTP_USER",
    "SUPABASE_AUTH_SMTP_ADMIN_EMAIL", "SUPABASE_AUTH_SMTP_SENDER_NAME",
    "SUPABASE_AUTH_URI_ALLOW_LIST"];
  for (const name of required) if (!value(name)) errors.push(`${name} is required`);
  const password = value("RESEND_API_KEY");
  if (!password) errors.push("RESEND_API_KEY is required");
  else if (!/^re_[A-Za-z0-9_]{20,}$/.test(password)) errors.push("RESEND_API_KEY must have the expected Resend key format");
  for (const name of Object.keys(env)) {
    if (/^NEXT_PUBLIC_.*(?:RESEND|SMTP|ACCESS_TOKEN|SERVICE_ROLE)/.test(name) && value(name)) {
      errors.push(`${name} must not expose a server-only email/management credential`);
    }
  }
  const site = value("NEXT_PUBLIC_SITE_URL")
    ? httpsUrl(value("NEXT_PUBLIC_SITE_URL"), "NEXT_PUBLIC_SITE_URL", errors, true) : null;
  const supabase = value("NEXT_PUBLIC_SUPABASE_URL")
    ? httpsUrl(value("NEXT_PUBLIC_SUPABASE_URL"), "NEXT_PUBLIC_SUPABASE_URL", errors, true) : null;
  const callback = value("SUPABASE_AUTH_CONFIRM_REDIRECT_URL");
  if (site && callback && callback !== `${site.origin}/auth/confirm`) {
    errors.push("SUPABASE_AUTH_CONFIRM_REDIRECT_URL must exactly equal NEXT_PUBLIC_SITE_URL/auth/confirm");
  }
  if (value("SUPABASE_AUTH_SMTP_HOST") && value("SUPABASE_AUTH_SMTP_HOST") !== "smtp.resend.com") {
    errors.push("SUPABASE_AUTH_SMTP_HOST must be smtp.resend.com for production Resend delivery");
  }
  if (value("SUPABASE_AUTH_SMTP_USER") && value("SUPABASE_AUTH_SMTP_USER") !== "resend") {
    errors.push("SUPABASE_AUTH_SMTP_USER must be resend");
  }
  if (value("SUPABASE_AUTH_SMTP_PORT") && !["465", "587", "2465", "2587"].includes(value("SUPABASE_AUTH_SMTP_PORT"))) {
    errors.push("SUPABASE_AUTH_SMTP_PORT must be a supported TLS SMTP port (465, 587, 2465, 2587)");
  }
  const sender = value("SUPABASE_AUTH_SMTP_ADMIN_EMAIL");
  if (sender && !/^[^\s<>@]+@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(sender)) {
    errors.push("SUPABASE_AUTH_SMTP_ADMIN_EMAIL must be a sender email address without a display name");
  }
  if (sender && sender.toLowerCase() !== "no-reply@pen-pals.net") errors.push("SUPABASE_AUTH_SMTP_ADMIN_EMAIL must be no-reply@pen-pals.net");
  if (value("SUPABASE_AUTH_SMTP_SENDER_NAME") && value("SUPABASE_AUTH_SMTP_SENDER_NAME") !== "Pen-Pals") {
    errors.push("SUPABASE_AUTH_SMTP_SENDER_NAME must be Pen-Pals");
  }
  if (/[\r\n]/.test(value("SUPABASE_AUTH_SMTP_SENDER_NAME"))) errors.push("SMTP sender name must be a single line");
  const redirectValues = value("SUPABASE_AUTH_URI_ALLOW_LIST").split(",").map((item) => item.trim()).filter(Boolean);
  const requiredRedirects = site ? [callback, `${site.origin}/auth/callback`,
    `${site.origin}/auth/callback?mode=login`, `${site.origin}/auth/callback?mode=link`] : [];
  for (const redirect of redirectValues) {
    httpsUrl(redirect, "SUPABASE_AUTH_URI_ALLOW_LIST entry", errors);
    if (/[*{}[\]\\]/.test(redirect)) errors.push("SUPABASE_AUTH_URI_ALLOW_LIST must use reviewed exact production URLs, not wildcards");
  }
  for (const requiredRedirect of requiredRedirects) {
    if (requiredRedirect && !redirectValues.includes(requiredRedirect)) {
      errors.push(`SUPABASE_AUTH_URI_ALLOW_LIST must include ${requiredRedirect}`);
    }
  }
  if (errors.length) throw new EmailConfigurationError(errors.join("\n"));
  return {
    siteUrl: site.origin, supabaseUrl: supabase.origin, callback,
    smtpHost: value("SUPABASE_AUTH_SMTP_HOST"), smtpPort: value("SUPABASE_AUTH_SMTP_PORT"),
    smtpUser: value("SUPABASE_AUTH_SMTP_USER"), smtpPassword: password,
    senderEmail: sender, senderName: value("SUPABASE_AUTH_SMTP_SENDER_NAME"),
    redirectAllowList: redirectValues,
  };
}
