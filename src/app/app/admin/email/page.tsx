import { readFile } from "node:fs/promises";
import { requireAdmin } from "../guard";
import { AdminHeader, AdminPage, StatusChip } from "../AdminChrome";

type MailConfig = Record<string, string>;

function parseEnv(text: string): MailConfig {
  const result: MailConfig = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    result[key] = value;
  }
  return result;
}

async function readEnv(path: string) {
  try {
    return parseEnv(await readFile(path, "utf8"));
  } catch {
    return {} as MailConfig;
  }
}

function configured(value: string | undefined) {
  return Boolean(value?.trim());
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="border-b border-black/10 py-3 last:border-b-0"><dt className="text-xs font-semibold uppercase tracking-[.1em] text-black/40">{label}</dt><dd className="mt-1 break-words text-sm text-primary">{value}</dd></div>;
}

export default async function AdminEmail() {
  await requireAdmin();
  const [appEnv, authEnv] = await Promise.all([
    readEnv("/etc/penpals/app.env"),
    readEnv("/opt/supabase/docker/.env"),
  ]);

  const authConfigured = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_ADMIN_EMAIL", "SMTP_SENDER_NAME"].every((key) => configured(authEnv[key]));
  const supportConfigured = configured(appEnv.RESEND_API_KEY);
  const resendSmtp = authEnv.SMTP_HOST === "smtp.resend.com" && authEnv.SMTP_USER === "resend";
  const sendOnlyCredential = configured(authEnv.SMTP_PASS) && authEnv.SMTP_PASS.startsWith("re_");
  const overallHealthy = authConfigured && supportConfigured;

  return <AdminPage>
    <AdminHeader active="email" eyebrow="Communications · Administrator only" title="Email" description="Review production email configuration and delivery capabilities without exposing mail credentials or message bodies." isAdmin>
      <StatusChip value={overallHealthy ? "Configured" : "Attention needed"} tone={overallHealthy ? "good" : "warn"} />
    </AdminHeader>

    <section className="mt-8 grid gap-4 lg:grid-cols-2" aria-label="Email delivery configuration">
      <article className="border border-black/10 bg-white/35 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="admin-eyebrow">Authentication email</p><h2 className="section-title mt-1">Supabase Auth SMTP</h2></div><StatusChip value={authConfigured ? "Configured" : "Incomplete"} tone={authConfigured ? "good" : "warn"} /></div>
        <p className="section-description mt-3">Used for account verification and authentication email sent by the self-hosted Auth service.</p>
        <dl className="mt-5 border-y border-black/10">
          <Detail label="Provider" value={resendSmtp ? "Resend SMTP" : authEnv.SMTP_HOST || "Not configured"} />
          <Detail label="SMTP port" value={authEnv.SMTP_PORT || "Not configured"} />
          <Detail label="Sender" value={authEnv.SMTP_ADMIN_EMAIL || "Not configured"} />
          <Detail label="Sender name" value={authEnv.SMTP_SENDER_NAME || "Not configured"} />
          <Detail label="Email signup" value={authEnv.ENABLE_EMAIL_SIGNUP === "true" ? "Enabled" : "Disabled"} />
          <Detail label="Automatic confirmation" value={authEnv.ENABLE_EMAIL_AUTOCONFIRM === "true" ? "Enabled" : "Disabled"} />
        </dl>
      </article>

      <article className="border border-black/10 bg-white/35 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="admin-eyebrow">Application email</p><h2 className="section-title mt-1">Support delivery</h2></div><StatusChip value={supportConfigured ? "Configured" : "Not configured"} tone={supportConfigured ? "good" : "warn"} /></div>
        <p className="section-description mt-3">Used when staff replies to public contact messages by email from the Pen-Pals application.</p>
        <dl className="mt-5 border-y border-black/10">
          <Detail label="Provider" value="Resend API" />
          <Detail label="Application credential" value={supportConfigured ? "Configured" : "Missing from app runtime"} />
          <Detail label="Sender override" value={appEnv.SUPPORT_EMAIL_FROM || "Uses Auth sender identity"} />
          <Detail label="Reply-to" value={appEnv.SUPPORT_EMAIL_REPLY_TO || "Not configured"} />
        </dl>
        {!supportConfigured && <p className="mt-4 border-l-2 border-amber-500 px-3 py-2 text-sm leading-6 text-amber-800">Public contact email replies cannot be delivered by the application until its server-only Resend credential is configured.</p>}
      </article>
    </section>

    <section className="mt-10 border-t border-black/10 pt-7" aria-labelledby="history-heading">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="admin-eyebrow">Provider diagnostics</p><h2 id="history-heading" className="section-title mt-1">Delivery history</h2></div><StatusChip value="Unavailable" tone="neutral" /></div>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-black/55">The production SMTP credential is restricted to sending email, so provider-level sent, delivered, bounced, and rejected history cannot be read from this application.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="border border-black/10 bg-white/30 px-5 py-4"><p className="text-sm font-medium text-primary">Credential scope</p><p className="mt-1 text-xs leading-5 text-black/50">{sendOnlyCredential ? "A Resend sending credential is present; no read access is exposed here." : "No readable provider credential is available."}</p></div>
        <div className="border border-black/10 bg-white/30 px-5 py-4"><p className="text-sm font-medium text-primary">Message content</p><p className="mt-1 text-xs leading-5 text-black/50">Email bodies and secrets are intentionally not displayed by this Admin surface.</p></div>
      </div>
    </section>
  </AdminPage>;
}
