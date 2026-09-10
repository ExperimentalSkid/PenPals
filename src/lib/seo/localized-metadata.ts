import type { Metadata } from "next";
import type { AppLocale } from "@/i18n/config";
import { localizedPublicPath, seoSiteOrigin } from "@/lib/seo/public";

const socialImage = { url: "/assets/brand/social-preview-1200x630.png", width: 1200, height: 630, alt: "pen-pals.net" };

export function localizedPublicMetadata(locale: AppLocale, path: string, copy: Record<AppLocale, { title: string; description: string }>): Metadata {
  const origin = seoSiteOrigin();
  const localizedPath = localizedPublicPath(path, locale);
  const { title, description } = copy[locale];
  return {
    title,
    description,
    alternates: {
      canonical: `${origin}${localizedPath}`,
      languages: {
        en: `${origin}${localizedPublicPath(path, "en")}`,
        es: `${origin}${localizedPublicPath(path, "es")}`,
        "x-default": `${origin}${localizedPublicPath(path, "en")}`,
      },
    },
    openGraph: {
      title,
      description,
      url: `${origin}${localizedPath}`,
      siteName: "pen-pals.net",
      type: "website",
      locale: locale === "es" ? "es_ES" : "en_US",
      alternateLocale: [locale === "es" ? "en_US" : "es_ES"],
      images: [socialImage],
    },
    twitter: { card: "summary_large_image", title, description, images: [socialImage.url] },
  };
}
