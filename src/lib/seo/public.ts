import type { Metadata } from "next";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { AppLocale } from "@/i18n/config";

export type SeoSurfaceDimension = "country" | "language" | "interest";

export type SeoRelatedCommunity = {
  name: string;
  slug: string;
  member_count: number;
};

export type SeoSurface = {
  surface_dimension: SeoSurfaceDimension;
  canonical_slug: string;
  canonical_name: string;
  aggregate_key: string;
  member_count: number;
  cohort_size: number;
  calculated_at: string;
  related: {
    countries: SeoRelatedCommunity[];
    languages: SeoRelatedCommunity[];
    interests: SeoRelatedCommunity[];
    connection_goals: SeoRelatedCommunity[];
  };
};

export type SeoSitemapRoute = {
  route_dimension: SeoSurfaceDimension;
  canonical_slug: string;
  last_modified: string;
};

type RawRelated = Record<string, unknown>;

/** Keep route slugs deterministic and aligned with the SQL public projection. */
export function seoSlug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function relatedList(value: unknown): SeoRelatedCommunity[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as RawRelated;
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const slug = typeof row.slug === "string" ? row.slug.trim() : seoSlug(name);
    const memberCount = typeof row.member_count === "number" ? row.member_count : Number(row.member_count);
    if (!name || !slug || !Number.isSafeInteger(memberCount) || memberCount < 0) return [];
    return [{ name, slug, member_count: memberCount }];
  });
}

function parseSurface(value: unknown): SeoSurface | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const dimension = row.surface_dimension;
  const canonicalSlug = typeof row.canonical_slug === "string" ? row.canonical_slug : "";
  const canonicalName = typeof row.canonical_name === "string" ? row.canonical_name : "";
  const aggregateKey = typeof row.aggregate_key === "string" ? row.aggregate_key : "";
  const memberCount = typeof row.member_count === "number" ? row.member_count : Number(row.member_count);
  const cohortSize = typeof row.cohort_size === "number" ? row.cohort_size : Number(row.cohort_size);
  const calculatedAt = typeof row.calculated_at === "string" ? row.calculated_at : "";
  if ((dimension !== "country" && dimension !== "language" && dimension !== "interest") || !canonicalSlug || !canonicalName || !aggregateKey || !calculatedAt) return null;
  if (!Number.isSafeInteger(memberCount) || memberCount < 0 || !Number.isSafeInteger(cohortSize) || cohortSize < 0) return null;
  const related = row.related && typeof row.related === "object" && !Array.isArray(row.related)
    ? row.related as Record<string, unknown>
    : {};
  return {
    surface_dimension: dimension,
    canonical_slug: canonicalSlug,
    canonical_name: canonicalName,
    aggregate_key: aggregateKey,
    member_count: memberCount,
    cohort_size: cohortSize,
    calculated_at: calculatedAt,
    related: {
      countries: relatedList(related.countries),
      languages: relatedList(related.languages),
      interests: relatedList(related.interests),
      connection_goals: relatedList(related.connection_goals),
    },
  };
}

// Request-local only: metadata and page rendering share one projection read.
// This must not cache eligibility or viewer state across requests.
const loadCanonicalSeoSurface = cache(async (dimension: SeoSurfaceDimension, normalizedSlug: string): Promise<SeoSurface | null> => {
  const db = await createClient();
  const { data, error } = await db.rpc("get_public_seo_surface", { p_dimension: dimension, p_slug: normalizedSlug });
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  return parseSurface(row);
});

export async function loadPublicSeoSurface(dimension: SeoSurfaceDimension, slug: string): Promise<SeoSurface | null> {
  const normalizedSlug = seoSlug(slug);
  return normalizedSlug ? loadCanonicalSeoSurface(dimension, normalizedSlug) : null;
}

export async function loadPublicSeoSitemap(): Promise<SeoSitemapRoute[]> {
  const db = await createClient();
  const { data, error } = await db.rpc("get_public_seo_sitemap");
  if (error || !Array.isArray(data)) return [];
  return data.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    const dimension = row.route_dimension;
    const slug = typeof row.canonical_slug === "string" ? row.canonical_slug : "";
    const lastModified = typeof row.last_modified === "string" ? row.last_modified : "";
    if ((dimension !== "country" && dimension !== "language" && dimension !== "interest") || !slug || !lastModified) return [];
    return [{ route_dimension: dimension, canonical_slug: slug, last_modified: lastModified }];
  });
}

export function localizedPublicPath(path: string, locale: AppLocale): string {
  if (locale === "en") return path;
  return path === "/" ? "/es" : `/es${path}`;
}

export function localizedAlternates(path: string) {
  const origin = seoSiteOrigin();
  return {
    canonical: `${origin}${path}`,
    languages: {
      en: `${origin}${localizedPublicPath(path, "en")}`,
      es: `${origin}${localizedPublicPath(path, "es")}`,
      "x-default": `${origin}${localizedPublicPath(path, "en")}`,
    },
  };
}

export function seoSurfaceTitle(dimension: SeoSurfaceDimension, name: string, locale: AppLocale = "en"): string {
  if (locale === "es") {
    if (dimension === "country") return `Amigos por correspondencia en ${name} | pen-pals.net`;
    if (dimension === "language") return `Amigos por correspondencia que hablan ${name} | pen-pals.net`;
    return `Amigos por correspondencia interesados en ${name} | pen-pals.net`;
  }
  if (dimension === "country") return `Pen pals in ${name} | pen-pals.net`;
  if (dimension === "language") return `${name}-speaking pen pals | pen-pals.net`;
  return `Pen pals interested in ${name} | pen-pals.net`;
}

export function seoSurfaceDescription(dimension: SeoSurfaceDimension, name: string, memberCount: number, locale: AppLocale = "en"): string {
  const count = memberCount.toLocaleString(locale === "es" ? "es-ES" : "en-US");
  if (locale === "es") {
    const cohort = `${count} ${memberCount === 1 ? "miembro" : "miembros"} de Pen-Pals.net`;
    if (dimension === "country") return `Descubre qué interesa a ${cohort} en ${name} y cómo conectan con otras personas.`;
    if (dimension === "language") return `Descubre qué interesa a ${cohort} que hablan ${name} y cómo conectan con otras personas.`;
    return `Descubre cómo conectan en Pen-Pals.net ${cohort} interesados en ${name}.`;
  }
  const cohort = `${count} Pen-Pals.net member${memberCount === 1 ? "" : "s"}`;
  if (dimension === "country") return `Discover what ${cohort} in ${name} are interested in and how they connect.`;
  if (dimension === "language") return `Discover what ${cohort} who speak ${name} are interested in and how they connect.`;
  return `Discover how ${cohort} interested in ${name} connect across the Pen-Pals.net community.`;
}

export function seoSiteOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if ((url.protocol === "http:" || url.protocol === "https:") && !url.pathname.slice(1) && !url.search && !url.hash) return url.origin;
    } catch {
      // Fall back to the local development origin for metadata generation.
    }
  }
  return "http://localhost:3000";
}

export function seoSurfacePath(dimension: SeoSurfaceDimension, slug: string, locale: AppLocale = "en"): string {
  const path = `/${dimension}/${encodeURIComponent(slug)}`;
  return localizedPublicPath(path, locale);
}

export function seoSurfaceMetadata(
  dimension: SeoSurfaceDimension,
  surface: SeoSurface | null,
  requestedSlug?: string,
  hasQueryParams = false,
  locale: AppLocale = "en",
): Metadata {
  if (!surface) return { title: "pen-pals.net", robots: { index: false, follow: false } };
  const englishPath = `/${dimension}/${encodeURIComponent(surface.canonical_slug)}`;
  const path = seoSurfacePath(dimension, surface.canonical_slug, locale);
  const isCanonicalRequest = requestedSlug === undefined || requestedSlug === surface.canonical_slug;
  const title = seoSurfaceTitle(dimension, surface.canonical_name, locale);
  const description = seoSurfaceDescription(dimension, surface.canonical_name, surface.member_count, locale);
  return {
    title,
    description,
    alternates: {
      canonical: `${seoSiteOrigin()}${path}`,
      languages: {
        en: `${seoSiteOrigin()}${localizedPublicPath(englishPath, "en")}`,
        es: `${seoSiteOrigin()}${localizedPublicPath(englishPath, "es")}`,
        "x-default": `${seoSiteOrigin()}${localizedPublicPath(englishPath, "en")}`,
      },
    },
    robots: { index: isCanonicalRequest && !hasQueryParams, follow: true },
    openGraph: {
      title,
      description,
      url: `${seoSiteOrigin()}${path}`,
      type: "website",
      locale: locale === "es" ? "es_ES" : "en_US",
      alternateLocale: [locale === "es" ? "en_US" : "es_ES"],
      images: [{ url: "/assets/brand/social-preview-1200x630.png", width: 1200, height: 630, alt: "pen-pals.net" }],
    },
    twitter: { card: "summary_large_image", title, description, images: ["/assets/brand/social-preview-1200x630.png"] },
  };
}
