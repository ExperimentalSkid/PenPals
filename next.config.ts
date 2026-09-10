import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Supabase's local email flow also supports the loopback-IP site origin.
  allowedDevOrigins: ["127.0.0.1"],
  // Support submissions can include several attachments. Keep the Server
  // Action body limit above the validated aggregate while retaining the
  // upload validation in the support action/database boundary.
  experimental: {
    serverActions: {
      bodySizeLimit: "35mb",
    },
  },
  async headers() {
    const contentSecurityPolicyReportOnly = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.tile.openstreetmap.org",
      "font-src 'self' data:",
      "connect-src 'self' https://supabase.pen-pals.net wss://supabase.pen-pals.net",
      "worker-src 'self' blob:",
      "media-src 'self' blob:",
      "manifest-src 'self'",
    ].join("; ");
    const headers = [
      { key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicyReportOnly },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ];
    if (process.env.NODE_ENV === "production") {
      headers.push({ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" });
    }
    return [{ source: "/(.*)", headers }];
  },
};

export default withNextIntl(nextConfig);
