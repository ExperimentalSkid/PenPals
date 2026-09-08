import Link from "next/link";
import BrandLogo from "@/app/components/BrandLogo";
import type { SeoRelatedCommunity, SeoSurface, SeoSurfaceDimension } from "@/lib/seo/public";

function labelFor(dimension: SeoSurfaceDimension): string {
  if (dimension === "country") return "Country community";
  if (dimension === "language") return "Language community";
  return "Interest community";
}

function introFor(surface: SeoSurface): string {
  if (surface.surface_dimension === "country") return `Among Pen-Pals.net members in ${surface.canonical_name}, people are looking for international connections.`;
  if (surface.surface_dimension === "language") return `Among Pen-Pals.net members who speak ${surface.canonical_name}, people share interests and reasons to connect.`;
  return `Among Pen-Pals.net members interested in ${surface.canonical_name}, people choose to talk about this topic.`;
}

function relatedHref(dimension: "countries" | "languages" | "interests", item: SeoRelatedCommunity): string {
  if (dimension === "countries") return `/country/${encodeURIComponent(item.slug)}`;
  if (dimension === "languages") return `/language/${encodeURIComponent(item.slug)}`;
  return `/interest/${encodeURIComponent(item.slug)}`;
}

function relatedAnchor(dimension: "countries" | "languages" | "interests", item: SeoRelatedCommunity): string {
  if (dimension === "countries") return `Pen pals in ${item.name}`;
  if (dimension === "languages") return `Pen pals who speak ${item.name}`;
  return `Pen pals interested in ${item.name}`;
}

function RelatedSection({ title, dimension, items }: { title: string; dimension: "countries" | "languages" | "interests"; items: SeoRelatedCommunity[] }) {
  if (!items.length) return null;
  return <section className="mt-10" aria-labelledby={`${dimension}-heading`}>
    <div className="flex items-baseline justify-between gap-4">
      <h2 id={`${dimension}-heading`} className="font-serif text-2xl text-[#102A43]">{title}</h2>
      <span className="text-xs text-[#66717C]">Qualifying communities</span>
    </div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.slice(0, 12).map((item) => <Link key={`${item.slug}-${item.member_count}`} href={relatedHref(dimension, item)} className="rounded-2xl border border-[#D9D3C8] bg-white/75 p-4 transition hover:-translate-y-0.5 hover:border-[#60A4E1] hover:bg-white">
        <span className="block font-semibold text-[#102A43]">{relatedAnchor(dimension, item)}</span>
        <span className="mt-1 block text-sm text-[#66717C]">{item.member_count.toLocaleString("en-US")} members in this community</span>
      </Link>)}
    </div>
  </section>;
}

export default function SeoSurfacePage({ surface }: { surface: SeoSurface }) {
  const updated = new Date(surface.calculated_at);
  const updatedLabel = Number.isNaN(updated.getTime()) ? "Recently" : `${new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(updated)} UTC`;
  return <main className="min-h-screen px-6 py-8 sm:px-10 sm:py-10">
    <div className="mx-auto w-full max-w-6xl">
      <nav className="flex items-center justify-between gap-4" aria-label="Public navigation">
        <Link href="/" aria-label="pen-pals.net home" className="inline-flex items-center"><BrandLogo variant="wordmark" priority className="h-auto w-[9.5rem]" /></Link>
        <div className="flex items-center gap-2 text-sm font-semibold sm:gap-3">
          <Link href="/sign-in" className="rounded-full px-3 py-2 text-[#102A43] hover:bg-white/75 sm:px-4">Sign in</Link>
          <Link href="/sign-up" className="rounded-full bg-[#073A73] px-4 py-2.5 text-white shadow-sm hover:bg-[#052D59] sm:px-5">Join pen-pals.net</Link>
        </div>
      </nav>

      <div className="mt-12 max-w-3xl sm:mt-20">
        <p className="eyebrow">{labelFor(surface.surface_dimension)}</p>
        <h1 className="mt-4 font-serif text-5xl leading-[1.05] tracking-tight text-[#102A43] sm:text-7xl">{surface.surface_dimension === "country" ? "Pen pals in" : surface.surface_dimension === "language" ? "Pen pals who speak" : "Pen pals who enjoy"} <span className="text-[#073A73]">{surface.canonical_name}</span></h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-[#66717C]">{introFor(surface)}</p>
      </div>

      <section className="mt-10 grid gap-4 sm:grid-cols-3" aria-label="Community statistics">
        <div className="surface p-5"><p className="text-sm text-[#66717C]">Pen-Pals.net members</p><p className="mt-2 font-serif text-4xl text-[#073A73]">{surface.member_count.toLocaleString("en-US")}</p><p className="mt-2 text-xs text-[#66717C]">in this community</p></div>
        <div className="surface p-5"><p className="text-sm text-[#66717C]">Community type</p><p className="mt-2 font-serif text-2xl capitalize text-[#102A43]">{surface.surface_dimension}</p><p className="mt-2 text-xs text-[#66717C]">Based on member profiles</p></div>
        <div className="surface p-5"><p className="text-sm text-[#66717C]">Data updated</p><p className="mt-2 font-serif text-2xl text-[#102A43]">{updatedLabel}</p><p className="mt-2 text-xs text-[#66717C]">Calculated from current data</p></div>
      </section>

      <div className="mt-10 rounded-3xl border border-[#D9D3C8] bg-[#E7F1FA]/70 p-5 text-sm leading-6 text-[#102A43] sm:p-6">
        <p><strong>About these numbers.</strong> These anonymous statistics describe Pen-Pals.net members only—not the general population of {surface.canonical_name}.</p>
      </div>

      <RelatedSection title={surface.surface_dimension === "country" ? "Languages spoken here" : "Countries represented"} dimension={surface.surface_dimension === "country" ? "languages" : "countries"} items={surface.surface_dimension === "country" ? surface.related.languages : surface.related.countries} />
      <RelatedSection title={surface.surface_dimension === "language" ? "Interests shared by this community" : surface.surface_dimension === "interest" ? "Languages spoken by this community" : "Interests shared here"} dimension={surface.surface_dimension === "interest" ? "languages" : "interests"} items={surface.surface_dimension === "interest" ? surface.related.languages : surface.related.interests} />

      <section className="mt-12 rounded-3xl bg-[#073A73] p-7 text-white sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-[.16em] text-[#E7F1FA]">Make your own connection</p>
        <h2 className="mt-3 max-w-2xl font-serif text-3xl sm:text-4xl">Find someone whose world you&apos;d like to know.</h2>
        <p className="mt-3 max-w-xl leading-7 text-[#E7F1FA]">Join pen-pals.net to browse member profiles and start a conversation.</p>
        <div className="mt-6 flex flex-wrap gap-3"><Link href="/sign-up" className="rounded-full bg-white px-5 py-3 font-semibold text-[#073A73] hover:bg-[#F1EBDF]">Create an account <span aria-hidden>→</span></Link><Link href="/app/discover" className="rounded-full border border-white/50 px-5 py-3 font-semibold text-white hover:bg-white/10">Explore Discover</Link></div>
      </section>

      <footer className="mt-12 border-t border-[#D9D3C8] pt-5 text-sm text-[#66717C]"><Link href="/" className="hover:text-[#073A73] hover:underline">pen-pals.net</Link><span className="mx-2" aria-hidden>·</span><span>Real people. Meaningful connections.</span></footer>
    </div>
  </main>;
}
