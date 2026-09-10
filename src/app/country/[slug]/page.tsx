import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import SeoSurfacePage from "@/app/seo/SeoSurfacePage";
import { loadPublicSeoSurface, seoSurfaceMetadata, seoSurfacePath } from "@/lib/seo/public";
import { resolveLocale } from "@/i18n/server";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> {
  const { slug } = await params;
  const query = await searchParams;
  const [surface, locale] = await Promise.all([loadPublicSeoSurface("country", slug), resolveLocale()]);
  return seoSurfaceMetadata("country", surface, slug, Object.keys(query).length > 0, locale);
}

export default async function CountrySeoPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  const [surface, locale] = await Promise.all([loadPublicSeoSurface("country", slug), resolveLocale()]);
  if (!surface) notFound();
  const query = await searchParams;
  if (slug !== surface.canonical_slug || Object.keys(query).length > 0) permanentRedirect(seoSurfacePath("country", surface.canonical_slug, locale));
  return <SeoSurfacePage surface={surface} />;
}
