import Link from "next/link";
import BrandLogo from "@/app/components/BrandLogo";
import PublicFooter from "@/app/components/PublicFooter";
import { getPageI18n } from "@/i18n/server";
import { seoSiteOrigin, seoSurfacePath, type SeoRelatedCommunity, type SeoSurface, type SeoSurfaceDimension } from "@/lib/seo/public";

type T = (key: string, values?: Record<string, string | number>) => string;

function labelFor(dimension: SeoSurfaceDimension, t: T) {
  return t(`seoSurface.${dimension === "country" ? "labelCountry" : dimension === "language" ? "labelLanguage" : "labelInterest"}`);
}
function introFor(surface: SeoSurface, t: T) {
  return t(`seoSurface.${surface.surface_dimension === "country" ? "introCountry" : surface.surface_dimension === "language" ? "introLanguage" : "introInterest"}`, { name: surface.canonical_name });
}
function relatedAnchor(dimension: "countries" | "languages" | "interests", item: SeoRelatedCommunity, t: T) {
  return t(`seoSurface.${dimension === "countries" ? "relatedCountry" : dimension === "languages" ? "relatedLanguage" : "relatedInterest"}`, { name: item.name });
}
function CommunityContext({ surface, t }: { surface: SeoSurface; t: T }) {
  const firstCountry = surface.related.countries[0];
  const firstLanguage = surface.related.languages[0];
  const firstInterest = surface.related.interests[0];
  const parts: string[] = [];
  if (firstCountry && surface.surface_dimension !== "country") parts.push(t("seoSurface.mostCountry", { name: firstCountry.name }));
  if (firstLanguage && surface.surface_dimension !== "language") parts.push(t("seoSurface.mostLanguage", { name: firstLanguage.name }));
  if (firstInterest && surface.surface_dimension !== "interest") parts.push(t("seoSurface.mostInterest", { name: firstInterest.name }));
  if (!parts.length) return null;
  return <section className="mt-10" aria-labelledby="community-context-heading"><h2 id="community-context-heading" className="section-title">{t("seoSurface.snapshot")}</h2><p className="section-description mt-3 max-w-3xl">{t("seoSurface.snapshotBody", { parts: parts.join("; ") })}</p></section>;
}
function RelatedSection({ title, dimension, items, locale, t }: { title: string; dimension: "countries" | "languages" | "interests"; items: SeoRelatedCommunity[]; locale: "en" | "es"; t: T }) {
  if (!items.length) return null;
  const routeDimension = dimension === "countries" ? "country" : dimension === "languages" ? "language" : "interest";
  return <section className="mt-10" aria-labelledby={`${dimension}-heading`}><div className="flex items-baseline justify-between gap-4"><h2 id={`${dimension}-heading`} className="section-title">{title}</h2><span className="text-xs text-muted">{t("seoSurface.qualifying")}</span></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{items.slice(0,12).map((item)=><Link key={`${item.slug}-${item.member_count}`} href={seoSurfacePath(routeDimension,item.slug,locale)} className="rounded-2xl border border-[#D9D3C8] bg-white/75 p-4 transition hover:-translate-y-0.5 hover:border-[#60A4E1] hover:bg-white"><span className="block font-semibold text-[#102A43]">{relatedAnchor(dimension,item,t)}</span><span className="mt-1 block text-sm text-muted">{t("seoSurface.membersCommunity",{count:item.member_count.toLocaleString(locale === "es" ? "es-ES" : "en-US")})}</span></Link>)}</div></section>;
}

export default async function SeoSurfacePage({ surface }: { surface: SeoSurface }) {
  const { locale, t } = await getPageI18n();
  const path = seoSurfacePath(surface.surface_dimension, surface.canonical_slug, locale);
  const breadcrumbStructuredData = { "@context":"https://schema.org", "@type":"BreadcrumbList", itemListElement:[{ "@type":"ListItem", position:1, name:"pen-pals.net", item:`${seoSiteOrigin()}${locale === "es" ? "/es" : "/"}` },{ "@type":"ListItem", position:2, name:surface.canonical_name, item:`${seoSiteOrigin()}${path}` }] };
  const updated = new Date(surface.calculated_at);
  const updatedLabel = Number.isNaN(updated.getTime()) ? t("seoSurface.recently") : `${new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-US", { dateStyle:"medium", timeStyle:"short", timeZone:"UTC" }).format(updated)} UTC`;
  const headingKey = surface.surface_dimension === "country" ? "headingCountry" : surface.surface_dimension === "language" ? "headingLanguage" : "headingInterest";
  return <main lang={locale} className="min-h-screen px-6 py-8 sm:px-10 sm:py-10"><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(breadcrumbStructuredData).replace(/</g,"\\u003c")}}/><div className="mx-auto w-full max-w-6xl"><nav className="flex items-center justify-between gap-4" aria-label="Public navigation"><Link href={locale === "es" ? "/es" : "/"} aria-label="pen-pals.net home" className="inline-flex items-center"><BrandLogo variant="wordmark" priority className="h-auto w-[9.5rem]"/></Link><div className="flex items-center gap-2 text-sm font-semibold sm:gap-3"><Link href="/sign-in" className="rounded-full px-3 py-2 text-[#102A43] hover:bg-white/75 sm:px-4">{t("seoSurface.signIn")}</Link><Link href="/sign-up" className="rounded-full bg-[#073A73] px-4 py-2.5 text-white shadow-sm hover:bg-[#052D59] sm:px-5">{t("seoSurface.join")}</Link></div></nav>
  <div className="mt-12 max-w-3xl sm:mt-20"><p className="eyebrow">{labelFor(surface.surface_dimension,t)}</p><h1 className="mt-4 font-serif text-5xl leading-[1.05] tracking-tight text-[#102A43] sm:text-7xl">{t(`seoSurface.${headingKey}`)} <span className="text-[#073A73]">{surface.canonical_name}</span></h1><p className="mt-6 max-w-2xl text-lg leading-8 text-muted">{introFor(surface,t)}</p></div>
  <section className="mt-10 grid gap-4 sm:grid-cols-3" aria-label={t("seoSurface.statsAria")}><div className="surface p-5"><p className="text-sm text-muted">{t("seoSurface.members")}</p><p className="mt-2 font-serif text-4xl text-[#073A73]">{surface.member_count.toLocaleString(locale === "es" ? "es-ES" : "en-US")}</p><p className="mt-2 text-xs text-muted">{t("seoSurface.inCommunity")}</p></div><div className="surface p-5"><p className="text-sm text-muted">{t("seoSurface.communityType")}</p><p className="mt-2 font-serif text-2xl capitalize text-[#102A43]">{labelFor(surface.surface_dimension,t)}</p><p className="mt-2 text-xs text-muted">{t("seoSurface.basedProfiles")}</p></div><div className="surface p-5"><p className="text-sm text-muted">{t("seoSurface.updated")}</p><p className="mt-2 font-serif text-2xl text-[#102A43]">{updatedLabel}</p><p className="mt-2 text-xs text-muted">{t("seoSurface.calculated")}</p></div></section>
  <div className="mt-10 rounded-3xl border border-[#D9D3C8] bg-[#E7F1FA]/70 p-5 text-sm leading-6 text-[#102A43] sm:p-6"><p><strong>{t("seoSurface.numbersTitle")}</strong> {t("seoSurface.numbersBody",{name:surface.canonical_name})}</p></div>
  <CommunityContext surface={surface} t={t}/><RelatedSection title={surface.surface_dimension === "country" ? t("seoSurface.languagesHere") : t("seoSurface.countriesRepresented")} dimension={surface.surface_dimension === "country" ? "languages" : "countries"} items={surface.surface_dimension === "country" ? surface.related.languages : surface.related.countries} locale={locale} t={t}/><RelatedSection title={surface.surface_dimension === "language" ? t("seoSurface.interestsShared") : surface.surface_dimension === "interest" ? t("seoSurface.languagesSpoken") : t("seoSurface.interestsHere")} dimension={surface.surface_dimension === "interest" ? "languages" : "interests"} items={surface.surface_dimension === "interest" ? surface.related.languages : surface.related.interests} locale={locale} t={t}/>
  <section className="mt-12 rounded-3xl bg-[#073A73] p-7 text-white sm:p-10"><p className="text-sm font-semibold uppercase tracking-[.16em] text-[#E7F1FA]">{t("seoSurface.ctaEyebrow")}</p><h2 className="mt-3 max-w-2xl font-serif text-3xl sm:text-4xl">{t("seoSurface.ctaTitle")}</h2><p className="mt-3 max-w-xl leading-7 text-[#E7F1FA]">{t("seoSurface.ctaBody")}</p><div className="mt-6 flex flex-wrap gap-3"><Link href="/sign-up" className="rounded-full bg-white px-5 py-3 font-semibold text-[#073A73] hover:bg-[#F1EBDF]">{t("seoSurface.create")} <span aria-hidden>→</span></Link><Link href="/app/discover" className="rounded-full border border-white/50 px-5 py-3 font-semibold text-white hover:bg-white/10">{t("seoSurface.explore")}</Link></div></section><PublicFooter className="mt-12"/></div></main>;
}
