import { createHash } from "node:crypto";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const clean = (value: string | null, max = 512) => value?.trim().slice(0, max) || null;

export function publicContactRequestMetadata(headers: Headers) {
  const cfIp = clean(headers.get("cf-connecting-ip"), 64);
  const realIp = clean(headers.get("x-real-ip"), 64);
  const forwardedIp = clean(headers.get("x-forwarded-for")?.split(",")[0] ?? null, 64);
  const ip = cfIp || realIp || forwardedIp;
  const userAgent = clean(headers.get("user-agent"), 1000);
  const clientKey = [ip, userAgent].filter(Boolean).join("|");
  return {
    ip,
    ip_source: cfIp ? "cf-connecting-ip" : realIp ? "x-real-ip" : forwardedIp ? "x-forwarded-for" : null,
    ip_hash: ip ? hash(ip) : null,
    client_key_hash: clientKey ? hash(clientKey) : null,
    user_agent: userAgent,
    cf_country: clean(headers.get("cf-ipcountry"), 8),
    cf_ray: clean(headers.get("cf-ray"), 80),
    accept_language: clean(headers.get("accept-language"), 300),
    referer: clean(headers.get("referer"), 1000),
    origin: clean(headers.get("origin"), 500),
    sec_ch_ua: clean(headers.get("sec-ch-ua"), 500),
    sec_ch_ua_platform: clean(headers.get("sec-ch-ua-platform"), 100),
    sec_ch_ua_mobile: clean(headers.get("sec-ch-ua-mobile"), 20),
  };
}
