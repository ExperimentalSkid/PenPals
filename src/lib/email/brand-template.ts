const DEFAULT_SITE = "https://pen-pals.net";

export function escapeEmailHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export function emailParagraphs(value: string) {
  return value.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean).map((paragraph) => `<p style="margin:0 0 16px;color:#455064;font-size:16px;line-height:1.65;">${escapeEmailHtml(paragraph).replace(/\n/g, "<br />")}</p>`).join("\n");
}

function siteOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim() || DEFAULT_SITE;
  try { return new URL(configured).origin; } catch { return DEFAULT_SITE; }
}

export function brandedEmailHtml({ heading, bodyHtml, button, footerHtml }: { heading: string; bodyHtml: string; button?: { label: string; href: string }; footerHtml?: string }) {
  const origin = siteOrigin();
  const logo = `${origin}/assets/brand/logo/logo-primary.png`;
  const cta = button ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:26px"><tr><td bgcolor="#073A73" style="border-radius:8px"><a href="${escapeEmailHtml(button.href)}" style="display:inline-block;padding:13px 20px;color:#ffffff;font-size:15px;font-weight:700;line-height:1.4;text-decoration:none">${escapeEmailHtml(button.label)}</a></td></tr></table>` : "";
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f7f5ef;color:#073A73;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f7f5ef"><tr><td align="center" style="padding:38px 18px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px"><tr><td align="center" style="padding:0 0 22px"><img src="${escapeEmailHtml(logo)}" width="176" alt="pen-pals.net" style="display:block;width:176px;max-width:100%;height:auto;border:0"></td></tr><tr><td><div style="height:1px;background:#60A4E1;opacity:.55"></div></td></tr><tr><td style="padding:24px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fffdf7;border:1px solid #e2ddd1;border-radius:18px"><tr><td style="padding:32px 28px"><h1 style="margin:0 0 18px;color:#073A73;font-size:28px;line-height:1.22">${escapeEmailHtml(heading)}</h1>${bodyHtml}${cta}</td></tr></table></td></tr><tr><td style="padding:0 6px;color:#6c7280;font-size:12px;line-height:1.6">${footerHtml || ""}<p style="margin:14px 0 0;color:#073A73;font-weight:700">pen-pals.net</p></td></tr></table></td></tr></table></body></html>`;
}
