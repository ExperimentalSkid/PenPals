import type { MetadataRoute } from "next";
import { seoSiteOrigin } from "@/lib/seo/public";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/app/", "/auth/"],
    },
    sitemap: `${seoSiteOrigin()}/sitemap.xml`,
  };
}

