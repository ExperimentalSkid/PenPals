import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import SeoSurfacePage from "@/app/seo/SeoSurfacePage";
import { loadPublicSeoSurface, seoSurfaceMetadata, seoSurfacePath } from "@/lib/seo/public";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> {
  const { slug } = await params;
  const query = await searchParams;
  const surface = await loadPublicSeoSurface("language", slug);
  return seoSurfaceMetadata("language", surface, slug, Object.keys(query).length > 0);
}

export default async function LanguageSeoPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  const surface = await loadPublicSeoSurface("language", slug);
  if (!surface) notFound();
  const query = await searchParams;
  if (slug !== surface.canonical_slug || Object.keys(query).length > 0) permanentRedirect(seoSurfacePath("language", surface.canonical_slug));
  return <SeoSurfacePage surface={surface} />;
}
