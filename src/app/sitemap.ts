import type { MetadataRoute } from "next";
import { loadPublicSeoSitemap, localizedPublicPath, seoSiteOrigin, seoSurfacePath } from "@/lib/seo/public";

// Sitemap contents depend on the current eligibility decision cache.  Keep it
// runtime-generated so a build can never accidentally publish stale or
// non-qualified catalogue values.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = seoSiteOrigin();
  const routes = await loadPublicSeoSitemap();
  const publicRoutes = ["/", "/faq", "/privacy", "/terms", "/contact"];
  return [
    ...publicRoutes.flatMap((path) => ([
      { url: `${origin}${localizedPublicPath(path, "en")}` },
      { url: `${origin}${localizedPublicPath(path, "es")}` },
    ])),
    ...routes.flatMap((route) => ([
      { url: `${origin}${seoSurfacePath(route.route_dimension, route.canonical_slug, "en")}`, lastModified: route.last_modified },
      { url: `${origin}${seoSurfacePath(route.route_dimension, route.canonical_slug, "es")}`, lastModified: route.last_modified },
    ])),
  ];
}
