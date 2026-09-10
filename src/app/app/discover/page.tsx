import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import DiscoverResults from "./DiscoverResults";
import DiscoverFilters from "./DiscoverFilters";
import { COUNTRY_OPTIONS, countryCodeForName } from "@/lib/countries";
import { getPageI18n } from "@/i18n/server";

const PAGE_SIZE = 6;

type SearchValue = string | string[] | undefined;

type JsonRecord = Record<string, unknown>;

type RegionOption = {
  value: string;
  label: string;
  country: string;
  is_major: boolean;
};

type DiscoverProfile = {
  id: string;
  username: string;
  display_name: string;
  age: number | null;
  country_code?: string | null;
  location_label?: string | null;
  quote?: string | null;
  interests: string[];
};

function asRecord(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asOptionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asNumberOrNull(value: unknown): number | null {
  const numeric = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(numeric) && numeric >= 0 && numeric <= 130 ? Math.floor(numeric) : null;
}

function canonicalCountryCode(value: string) {
  const normalized = value.trim().toUpperCase();
  if (!normalized) return "";
  if (COUNTRY_OPTIONS.some((country) => country.code === normalized)) return normalized;
  return countryCodeForName(value) ?? "";
}

function parseAgeParam(value: string) {
  const normalized = value.trim();
  if (!normalized) return { value: null, invalid: false };
  if (!/^\d+$/.test(normalized)) return { value: null, invalid: true };
  const numeric = Number(normalized);
  return {
    value: Number.isSafeInteger(numeric) ? numeric : null,
    invalid: !Number.isSafeInteger(numeric) || numeric < 13 || numeric > 100,
  };
}

function canonicalCatalogValue(value: string, options: string[]) {
  const normalized = value.trim().toLocaleLowerCase();
  // If a catalog read failed, retain the submitted value for the server-side
  // RPC instead of silently dropping a user's filter from the URL.
  if (!options.length) return value.trim();
  return normalized ? options.find((option) => option.toLocaleLowerCase() === normalized) ?? "" : "";
}

function first(value: SearchValue) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function queryPath(filters: Record<string, string>, page: number) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/app/discover?${query}` : "/app/discover";
}

export default async function Discover({ searchParams }: { searchParams: Promise<Record<string, SearchValue>> }) {
  const { locale, t } = await getPageI18n();
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  const uid = data?.claims?.sub;
  if (!uid) redirect("/sign-in");
  const params = await searchParams;
  const [{ data: languageCatalog }, { data: interestCatalog }, { data: regionCatalog }] = await Promise.all([
    db.from("languages").select("name").order("name"),
    db.from("interests").select("name").order("name"),
    db.from("location_regions").select("country_code,region_code,name,is_major").order("name"),
  ]);
  const rawCountry = first(params.country);
  const rawRegion = first(params.region);
  const rawRecent = first(params.recent);
  const rawSpoken = first(params.language_spoken);
  const rawLearning = first(params.language_learning);
  const rawInterest = first(params.interest);
  const normalizedCountry = canonicalCountryCode(rawCountry);
  const regionRows = Array.isArray(regionCatalog) ? regionCatalog as unknown[] : [];
  const languageRows = Array.isArray(languageCatalog) ? languageCatalog as unknown[] : [];
  const languageNames = [...new Set(languageRows.map((row) => asString(asRecord(row).name)).filter(Boolean))].sort();
  const interestRows = Array.isArray(interestCatalog) ? interestCatalog as unknown[] : [];
  const interestNames = [...new Set(interestRows.map((row) => asString(asRecord(row).name)).filter(Boolean))].sort();
  const regionMatch = normalizedCountry && rawRegion ? regionRows.map((row): RegionOption => {
    const region = asRecord(row);
    return {
      value: asString(region.region_code),
      label: asString(region.name),
      country: asString(region.country_code),
      is_major: asBoolean(region.is_major),
    };
  }).find((region) =>
    region.country.toUpperCase() === normalizedCountry
    && (region.value.toUpperCase() === rawRegion.toUpperCase() || region.label.toLowerCase() === rawRegion.toLowerCase())) : undefined;
  
  const filters = {
    country: normalizedCountry,
    // A region is scoped to the selected country.  Discard stale or
    // cross-country URL values rather than sending an impossible pair to the
    // RPC and leaving the toolbar in an inconsistent state.
    region: regionMatch?.value ?? "",
    gender: first(params.gender),
    min_age: first(params.min_age),
    max_age: first(params.max_age),
    language_spoken: canonicalCatalogValue(rawSpoken, languageNames),
    language_learning: canonicalCatalogValue(rawLearning, languageNames),
    interest: canonicalCatalogValue(rawInterest, interestNames),
    // The checkbox is a boolean filter.  Keep only its canonical URL value so
    // stale values such as recent=0/true-ish strings cannot appear active in
    // the toolbar or survive pagination links.
    recent: rawRecent === "1" || rawRecent.toLowerCase() === "true" ? "1" : "",
  };
  const parsedMinAge = parseAgeParam(filters.min_age);
  const parsedMaxAge = parseAgeParam(filters.max_age);
  const invalidAge = parsedMinAge.invalid
    || parsedMaxAge.invalid
    || (parsedMinAge.value !== null && parsedMaxAge.value !== null && parsedMinAge.value > parsedMaxAge.value);
  // Keep the old URL behavior for malformed age values (no matches), while
  // sending only valid integers to the typed RPC parameters.
  const minAge = invalidAge ? 101 : parsedMinAge.value;
  const maxAge = invalidAge ? 100 : parsedMaxAge.value;
  const recentOnly = filters.recent === "1";
  const parsedPage = Number.parseInt(first(params.page), 10);
  const requestedPage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  // Postgres integer parameters have a finite upper bound.  An excessively
  // large URL page is still an out-of-range page, so cap only the transport
  // offset; the total count below performs the normal redirect/clamp.
  const requestedOffset = Math.min((requestedPage - 1) * PAGE_SIZE, 2147483647);
  const { data: discoveryPage, error: discoveryError } = await db.rpc("get_discover_profiles_page", {
    p_viewer: uid,
    p_country: filters.country || null,
    p_region: filters.region || null,
    p_gender: filters.gender || null,
    p_min_age: minAge,
    p_max_age: maxAge,
    p_language_spoken: filters.language_spoken || null,
    p_language_learning: filters.language_learning || null,
    p_interest: filters.interest || null,
    p_recent: recentOnly,
    p_page_size: PAGE_SIZE,
    p_page_offset: requestedOffset,
  });
  const payload = asRecord(discoveryPage);
  // Age is already derived by the privacy-aware RPC; normalize only the
  // bounded page that was returned rather than calculating another user's DOB
  // in the browser.
  const profileRows = Array.isArray(payload.profiles) ? payload.profiles : [];
  const pageRows: DiscoverProfile[] = profileRows.map((row): DiscoverProfile => {
    const profile = asRecord(row);
    const rawInterests = Array.isArray(profile.interests) ? profile.interests : [];
    return {
      id: asString(profile.id),
      username: asString(profile.username),
      display_name: asString(profile.display_name),
      age: asNumberOrNull(profile.age),
      country_code: asOptionalString(profile.country_code),
      location_label: asOptionalString(profile.location_label),
      quote: asOptionalString(profile.quote),
      interests: rawInterests.filter((interest): interest is string => typeof interest === "string"),
    };
  });
  const parsedTotal = Number(payload.total_count);
  const totalCount = Number.isFinite(parsedTotal) && parsedTotal >= 0 ? Math.floor(parsedTotal) : 0;
  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);
  // City was a legacy filter.  Normalize old links to the new country/region
  // model instead of silently presenting an unfiltered result under a stale
  // city query parameter.
  const countryUrlNeedsNormalization = Boolean(rawCountry && normalizedCountry && rawCountry.trim() !== normalizedCountry);
  const regionUrlNeedsNormalization = Boolean(rawRegion && filters.region && rawRegion.trim() !== filters.region);
  const recentUrlNeedsNormalization = Boolean(rawRecent && (recentOnly ? rawRecent !== "1" : true));
  const spokenUrlNeedsNormalization = Boolean(rawSpoken && !filters.language_spoken) || Boolean(rawSpoken && filters.language_spoken && rawSpoken.trim() !== filters.language_spoken);
  const learningUrlNeedsNormalization = Boolean(rawLearning && !filters.language_learning) || Boolean(rawLearning && filters.language_learning && rawLearning.trim() !== filters.language_learning);
  const interestUrlNeedsNormalization = Boolean(rawInterest && !filters.interest) || Boolean(rawInterest && filters.interest && rawInterest.trim() !== filters.interest);
  if (first(params.city) || (rawCountry && !normalizedCountry) || (rawRegion && !filters.region) || countryUrlNeedsNormalization || regionUrlNeedsNormalization || recentUrlNeedsNormalization || spokenUrlNeedsNormalization || learningUrlNeedsNormalization || interestUrlNeedsNormalization) redirect(queryPath(filters, page));
  if (first(params.page) && String(page) !== first(params.page)) redirect(queryPath(filters, page));
  const queryParams = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) queryParams.set(key, value);
  if (page > 1) queryParams.set("page", String(page));
  const queryString = queryParams.toString();
  const regions = regionRows.map((row): RegionOption => {
    const region = asRecord(row);
    return { value: asString(region.region_code), label: asString(region.name), country: asString(region.country_code), is_major: asBoolean(region.is_major) };
  });
  const genders = (Array.isArray(payload.gender_options) ? payload.gender_options : []).filter((gender): gender is string => typeof gender === "string" && Boolean(gender)).sort();
  const filterOptions = {
    countries: COUNTRY_OPTIONS.map((country) => ({ value: country.code, label: country.name, searchAliases: country.aliases })),
    regions,
    genders: genders.map((gender) => ({ value: gender, label: gender })),
    languages: languageNames.map((language) => ({ value: language, label: language })),
    interests: interestNames.map((interest) => ({ value: interest, label: interest })),
  };

  return (
    <main lang={locale} className="mx-auto min-h-full w-full max-w-[1580px] bg-[#f7f5ef] px-6 py-12 text-primary sm:px-8 sm:py-14 lg:px-12 lg:py-16 xl:px-16">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="eyebrow">{t("app.discover.eyebrow")}</p>
          <h1 className="page-title-display mt-4 max-w-3xl">{t("app.discover.title")}</h1>
        </div>
        <Link href="/app/discover/mystery" className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[#087456]/35 bg-[#fbfaf6] px-4 py-2.5 text-sm font-semibold text-brand transition hover:border-[#087456]/65 hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#087456]">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="m4 7 5-4 3 4 3-4 5 4-4 5 4 5-5 4-3-4-3 4-5-4 4-5-4-5Z" /><circle cx="12" cy="12" r="2" /></svg>
          {t("app.discover.mystery")}
        </Link>
      </div>
      <p className="mt-5 max-w-xl text-lg leading-7 text-black/60 sm:text-xl">{t("app.discover.intro")}</p>

      <DiscoverFilters key={queryString} filters={filters} {...filterOptions} />

      <div className="mt-10 flex flex-wrap items-baseline justify-between gap-3 text-[15px] text-black/55">
        <span>{t("app.discover.found", { count: totalCount, noun: totalCount === 1 ? t("app.discover.person") : t("app.discover.people") })}</span>
        <span>{t("app.discover.page", { page, pages: pageCount })}</span>
      </div>
      {discoveryError ? (
        <div role="alert" className="mt-8 border-y border-red-900/15 bg-red-50/40 px-5 py-10 text-[#6f2a22] sm:px-7">
          <p className="font-serif text-2xl text-[#54211b]">{t("app.discover.loadError")}</p>
          <p className="section-description mt-2">{t("app.discover.filtersKept")}</p>
          <Link href={queryString ? `/app/discover?${queryString}` : "/app/discover"} className="mt-5 inline-flex min-h-10 items-center rounded-md border border-[#087456]/40 px-4 py-2 text-sm font-semibold text-brand transition hover:bg-white/70">{t("app.discover.tryAgain")}</Link>
        </div>
      ) : pageRows.length ? (
        <DiscoverResults profiles={pageRows} queryString={queryString} />
      ) : (
        <p className="mt-8 border-y border-black/10 py-14 text-black/50">{t("app.discover.empty")}</p>
      )}
      {pageCount > 1 && <nav aria-label={t("app.discover.pagination")} className="mt-8 flex items-center justify-between border-t border-black/10 pt-6">
          {page > 1 ? (
            <Link href={queryPath(filters, page - 1)} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[#d7d7cf] bg-[#fbfaf6] px-5 py-2.5 text-[15px] font-medium text-primary transition hover:border-[#087456]/55 hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#087456]">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m14.5 5-7 7 7 7M8 12h9" /></svg>
              {t("app.discover.previous")}
            </Link>
          ) : (
            <span className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[#e1e0d8] bg-[#f8f7f2] px-5 py-2.5 text-[15px] font-medium text-black/30" aria-disabled="true">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m14.5 5-7 7 7 7M8 12h9" /></svg>
              {t("app.discover.previous")}
            </span>
          )}
          {page < pageCount ? (
            <Link href={queryPath(filters, page + 1)} className="btn-primary inline-flex min-h-11 items-center gap-2 rounded-md px-6 py-2.5 text-[15px]">
              {t("app.discover.next")}
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m9.5 5 7 7-7 7M16 12H7" /></svg>
            </Link>
          ) : (
            <span className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[#e1e8e1] px-6 py-2.5 text-[15px] font-medium text-[#6d8177]" aria-disabled="true">
              {t("app.discover.next")}
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m9.5 5 7 7-7 7M16 12H7" /></svg>
            </span>
          )}
        </nav>}
    </main>
  );
}
