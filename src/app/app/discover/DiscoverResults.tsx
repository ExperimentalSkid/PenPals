"use client";

import { useTranslations } from "next-intl";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import CountryFlag from "@/app/components/CountryFlag";
import { countryNameForCode } from "@/lib/countries";

const RETURN_QUERY_KEY = "penpal.discover.return";

type Profile = {
  id: string;
  username: string;
  display_name: string;
  age: number | null;
  country_code?: string | null;
  location_label?: string | null;
  quote?: string | null;
  interests: string[];
};

export default function DiscoverResults({ profiles, queryString }: { profiles: Profile[]; queryString: string }) {
  const t = useTranslations();
  const router = useRouter();

  useEffect(() => {
    if (window.location.search) return;
    const savedQuery = window.sessionStorage.getItem(RETURN_QUERY_KEY);
    if (!savedQuery) return;
    window.sessionStorage.removeItem(RETURN_QUERY_KEY);
    router.replace(`/app/discover${savedQuery}`);
  }, [router]);

  const rememberFilters = () => {
    if (queryString) window.sessionStorage.setItem(RETURN_QUERY_KEY, `?${queryString}`);
    else window.sessionStorage.removeItem(RETURN_QUERY_KEY);
  };

  return (
    <section className="mt-8 grid gap-4 sm:gap-5 md:grid-cols-2 md:gap-x-5 md:gap-y-5" aria-label="Member profiles">
      {profiles.map((profile) => {
        const ageLabel = typeof profile.age === "number" && Number.isFinite(profile.age)
          ? `, ${Math.floor(profile.age)}`
          : "";
        const location = profile.location_label?.trim() || "";
        const countryName = countryNameForCode(profile.country_code);
        return (
          <Link key={profile.id} href={`/profile/${encodeURIComponent(profile.username)}`} onClick={rememberFilters} className="group flex min-h-[148px] h-full flex-col rounded-md border border-[#deded5] bg-[#fbfaf6] px-6 py-6 transition-colors hover:border-[#087456]/60 hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#087456] md:px-7 md:py-7">
            <h2 className="font-serif text-[1.55rem] font-normal leading-tight tracking-[-0.02em] text-primary group-hover:text-brand">
              {profile.display_name}{ageLabel}
            </h2>
            {location && <p className="mt-2 flex items-center gap-2 text-[14px] leading-5 text-black/55"><CountryFlag code={profile.country_code} countryName={countryName} /><span>{location}</span></p>}
            <p className="mt-4 max-w-2xl font-serif text-[1.15rem] leading-7 text-brand md:text-[1.25rem]">
              “{profile.quote || "Curious about the world and always happy to meet someone new."}”
            </p>
            <div className="mt-auto flex flex-wrap gap-2 pt-6">
              {profile.interests.length ? profile.interests.map((interest) => (
                <span key={interest} className="rounded-md bg-[#e9ede4] px-3 py-1.5 text-[13px] text-primary">{interest}</span>
              )) : <span className="text-[13px] text-black/45">{t("app.discover.openInterests")}</span>}
            </div>
          </Link>
        );
      })}
    </section>
  );
}
