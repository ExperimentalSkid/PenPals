import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Supabase's local email flow also supports the loopback-IP site origin.
  allowedDevOrigins: ["127.0.0.1"],
  images: { remotePatterns: [{ protocol: "https", hostname: "i.pravatar.cc" }] },
  // Support submissions can include up to three 10 MB attachments. Keep the
  // Server Action body limit above that aggregate while retaining the upload
  // validation in submitSupportTicket and the database RPC.
  experimental: {
    serverActions: {
      bodySizeLimit: "35mb",
    },
  },
  async headers() {
    const headers = [
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

export default nextConfig;
