import type { MetadataRoute } from "next";
import { loadPublicSeoSitemap, seoSiteOrigin, seoSurfacePath } from "@/lib/seo/public";

// Sitemap contents depend on the current eligibility decision cache.  Keep it
// runtime-generated so a build can never accidentally publish stale or
// non-qualified catalogue values.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = seoSiteOrigin();
  const routes = await loadPublicSeoSitemap();
  const publicRoutes = ["/", "/faq", "/privacy", "/contact"];
  return [
    ...publicRoutes.map((path) => ({ url: `${origin}${path}`, lastModified: new Date() })),
    ...routes.map((route) => ({
      url: `${origin}${seoSurfacePath(route.route_dimension, route.canonical_slug)}`,
      lastModified: route.last_modified,
    })),
  ];
}
