import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import BrandLogo from "./components/BrandLogo";
import FrontPageBird from "./components/FrontPageBird";
import PublicFooter from "./components/PublicFooter";
import LanguageSwitcher from "./components/LanguageSwitcher";
import { getPageI18n, resolveLocale } from "@/i18n/server";
import { localizedPublicMetadata } from "@/lib/seo/localized-metadata";
import { loadPublicSeoSitemap, loadPublicSeoSurface, localizedPublicPath, seoSurfacePath } from "@/lib/seo/public";

export async function generateMetadata() {
  const locale = await resolveLocale();
  return localizedPublicMetadata(locale, "/", {
    en: { title: "International Pen Pals & Online Friendship | pen-pals.net", description: "Meet international pen pals for genuine friendship, language exchange, and cultural exchange, with private messaging and digital Snail Mail. No swiping or follower counts." },
    es: { title: "Amigos por correspondencia internacionales y amistad online | pen-pals.net", description: "Conoce amigos por correspondencia internacionales para amistad genuina, intercambio de idiomas y culturas, con mensajería privada y Snail Mail digital. Sin deslizar ni contar seguidores." },
  });
}

function homeStructuredData(locale: "en" | "es") { return {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": "https://pen-pals.net/#website",
      url: "https://pen-pals.net/",
      name: "pen-pals.net",
      description: locale === "es" ? "Un lugar para conocer personas de todo el mundo mediante conversaciones reales, intereses compartidos y correspondencia genuina." : "A thoughtful place to meet people around the world through real conversations, shared interests, and genuine correspondence.",
      inLanguage: locale,
    },
    {
      "@type": "Organization",
      "@id": "https://pen-pals.net/#organization",
      url: "https://pen-pals.net/",
      name: "pen-pals.net",
      logo: "https://pen-pals.net/assets/brand/logo/logo-primary-1280w.png",
    },
  ],
}; }


export default async function Home() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (session) {
    redirect("/app");
  }

  const { locale, t } = await getPageI18n();
  const seoRoutes = await loadPublicSeoSitemap();
  const featuredRoutes = ["country", "language", "interest"].flatMap((dimension) => {
    const route = seoRoutes.find((item) => item.route_dimension === dimension);
    return route ? [route] : [];
  });
  const featuredSurfaces = (await Promise.all(
    featuredRoutes.map((route) => loadPublicSeoSurface(route.route_dimension, route.canonical_slug)),
  )).filter((surface) => surface !== null);

  return (
    <main lang={locale} className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-8 sm:px-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(homeStructuredData(locale)).replace(/</g, "\\u003c") }} />
      <nav className="flex items-center justify-between">
        <Link href={localizedPublicPath("/", locale)} aria-label={t("common.homeAria")} className="inline-flex items-center">
          <BrandLogo variant="wordmark" priority className="h-auto w-[9.5rem]" />
        </Link>
        <div className="flex items-center gap-2 text-sm font-semibold">
          <LanguageSwitcher locale={locale} label={t("common.language")} />
          <Link href="/sign-in" className="rounded-full px-4 py-2 text-primary hover:bg-white">{t("common.signIn")}</Link>
          <Link href="/sign-up" className="rounded-full bg-[#073A73] px-5 py-2.5 text-white shadow-sm hover:bg-[#052D59]">{t("common.joinFull")}</Link>
        </div>
      </nav>

      <section className="relative grid flex-1 items-center gap-12 pb-16 pt-20 lg:grid-cols-[1.1fr_.9fr] lg:gap-16 lg:pb-24 lg:pt-28">
        <FrontPageBird className="pointer-events-none absolute left-[55%] top-0 z-0 hidden w-[min(29rem,38vw)] -translate-x-1/2 lg:block" />
        <div className="front-page-hero-copy relative z-10 lg:pt-8">
          <p className="mb-6 inline-flex rounded-full bg-orange-100 px-4 py-2 text-sm font-semibold text-orange-800">{t("home.eyebrow")}</p>
          <h1 className="max-w-3xl font-serif text-5xl leading-[.98] tracking-[-0.035em] text-primary sm:text-7xl">{t("home.title")}</h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-muted">{t("home.description")}</p>
          <div className="mt-9 flex flex-wrap items-center gap-3 sm:gap-4">
            <Link href="/sign-up" className="motion-safe:transition-transform motion-safe:duration-300 motion-safe:hover:-translate-y-0.5 rounded-full bg-[#073A73] px-7 py-3.5 font-semibold text-white shadow-lg shadow-[#073A73]/15 hover:bg-[#052D59]">{t("home.findPeople")} <span aria-hidden>→</span></Link>
            <Link href="/sign-in" className="rounded-full border border-[#D9D3C8] bg-white/60 px-7 py-3.5 font-semibold text-primary hover:bg-white">{t("home.alreadyAccount")}</Link>
          </div>
          <div className="mt-12 flex gap-8 text-sm text-muted">
            <span><strong className="text-brand">🌎</strong> {t("home.countries")}</span>
            <span><strong className="text-[#073A43]">💬</strong> {t("home.conversations")}</span>
          </div>
        </div>

        <div className="front-page-conversation-card relative z-10 mx-auto w-full max-w-lg lg:mt-12">
          <div className="absolute -inset-7 rounded-[3.5rem] bg-orange-200/45 blur-3xl" />
          <div className="relative rounded-[2.25rem] border border-[#60A4E1]/20 bg-[#073A73] p-6 text-white shadow-[0_24px_50px_rgba(7,58,115,.2)]">
            <div className="rounded-[1.75rem] border border-[#D9D3C8]/60 bg-[#F1EBDF] p-6 text-primary">
              <div className="flex items-center justify-between text-xs font-semibold text-muted">
                <span>{t("home.nextHello")}</span>
                <span className="rounded-full bg-orange-100 px-3 py-1 text-orange-700">{t("home.readTime")}</span>
              </div>
              <div className="mt-8 flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-orange-300 text-2xl">🌻</div>
                <div>
                  <h2 className="subsection-title">{t("home.meetYuki")}</h2>
                  <p className="text-sm text-muted">{t("home.yukiMeta")}</p>
                </div>
              </div>
              <p className="mt-7 text-lg leading-8">{t("home.prompt")}</p>
              <div className="mt-7 rounded-2xl bg-white p-4 text-sm text-muted shadow-sm">{t("home.promptNote")}</div>
            </div>
            <p className="px-2 pb-1 pt-5 text-center text-sm text-[#E7F1FA]">{t("home.noSwiping")}</p>
          </div>
        </div>
      </section>

      {featuredSurfaces.length > 0 && (
        <section className="border-t border-[#D9D3C8] py-8" aria-labelledby="explore-communities-heading">
          <div className="flex flex-wrap items-baseline justify-center gap-x-5 gap-y-2 text-center text-sm">
            <h2 id="explore-communities-heading" className="font-semibold text-primary">{t("home.explore")}</h2>
            {featuredSurfaces.map((surface) => (
              <Link
                key={`${surface.surface_dimension}-${surface.canonical_slug}`}
                href={seoSurfacePath(surface.surface_dimension, surface.canonical_slug, locale)}
                className="font-medium text-brand underline-offset-4 hover:underline"
              >
                {surface.surface_dimension === "country"
                  ? t("home.countryLink", { name: surface.canonical_name })
                  : surface.surface_dimension === "language"
                    ? t("home.languageLink", { name: surface.canonical_name })
                    : t("home.interestLink", { name: surface.canonical_name })}
              </Link>
            ))}
          </div>
        </section>
      )}

      <PublicFooter />
    </main>
  );
}
