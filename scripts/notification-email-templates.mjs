function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function shell({ heading, body, button, href, footer }) {
  const origin = new URL(href).origin;
  const logo = `${origin}/assets/brand/logo/logo-primary.png`;
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f7f5ef;color:#073A73;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f7f5ef"><tr><td align="center" style="padding:38px 18px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px"><tr><td align="center" style="padding:0 0 22px"><img src="${escapeHtml(logo)}" width="176" alt="pen-pals.net" style="display:block;width:176px;max-width:100%;height:auto;border:0"></td></tr><tr><td><div style="height:1px;background:#60A4E1;opacity:.55"></div></td></tr><tr><td style="padding:24px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fffdf7;border:1px solid #e2ddd1;border-radius:18px"><tr><td style="padding:32px 28px"><h1 style="margin:0 0 18px;color:#073A73;font-size:28px;line-height:1.22">${escapeHtml(heading)}</h1><p style="margin:0;color:#455064;font-size:16px;line-height:1.65">${escapeHtml(body)}</p><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:26px"><tr><td bgcolor="#073A73" style="border-radius:8px"><a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 20px;color:#fff;font-size:15px;font-weight:700;line-height:1.4;text-decoration:none">${escapeHtml(button)}</a></td></tr></table></td></tr></table></td></tr><tr><td style="padding:0 6px;color:#6c7280;font-size:12px;line-height:1.6"><p style="margin:0">${escapeHtml(footer)}</p><p style="margin:14px 0 0;color:#073A73;font-weight:700">pen-pals.net</p></td></tr></table></td></tr></table></body></html>`;
}

export function snailMailArrivalEmail({ locale, openUrl }) {
  const es = locale === "es";
  const subject = es ? "Ha llegado una carta para ti" : "A letter has arrived for you";
  const heading = es ? "Tu Snail Mail ha llegado" : "Your Snail Mail has arrived";
  const body = es
    ? "Una carta que viajaba hacia ti ya ha llegado a tu buzón de Pen-Pals. Por privacidad, el contenido de la carta y sus fotos nunca se incluyen en este correo."
    : "A letter that was travelling to you has reached your Pen-Pals mailbox. For privacy, the letter contents and any photos are never included in this email.";
  const button = es ? "Abrir la carta" : "Open your letter";
  const footer = es
    ? "Puedes desactivar los correos de llegada de Snail Mail en Ajustes → Notificaciones."
    : "You can turn Snail Mail arrival emails off in Settings → Notifications.";
  const text = `${heading}\n\n${body}\n\n${button}: ${openUrl}\n\n${footer}`;
  return { subject, text, html: shell({ heading, body, button, href: openUrl, footer }) };
}
