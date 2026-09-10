import CountryFlag from "@/app/components/CountryFlag";

export type ProfileFriendshipDestination = {
  country_code?: string | null;
  country_name?: string | null;
  region_code?: string | null;
  region_name?: string | null;
};

export default function FriendshipDestinationsSection({ destinations }: { destinations: ProfileFriendshipDestination[] }) {
  const visibleDestinations = destinations.filter((destination) => destination.country_name?.trim() || destination.country_code?.trim());
  if (visibleDestinations.length === 0) return null;

  return (
    <section aria-labelledby="friendship-destinations-heading" className="mt-9 border-t border-black/10 pt-7">
      <h2 id="friendship-destinations-heading" className="flex items-center gap-3 font-sans text-[11px] font-semibold uppercase tracking-[.18em] text-primary">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="m4 12 16-8-4.5 16-3.5-6-8-2Z" />
          <path d="m12 14 3.5-3.5" />
        </svg>
        Places they&apos;d like to connect with
      </h2>
      <p className="mt-3 text-sm leading-6 text-black/50">These places are separate from their home location.</p>
      <div className="mt-4 flex flex-wrap gap-2.5">
        {visibleDestinations.map((destination, index) => {
          const countryName = destination.country_name?.trim() || destination.country_code?.trim() || "Country";
          const regionName = destination.region_name?.trim();
          return (
            <span key={`${destination.country_code ?? "country"}-${destination.region_code ?? "country"}-${index}`} className="inline-flex items-center gap-2 rounded-md border border-[#d8d0c2] bg-[#fbfaf6] px-3 py-2 text-sm text-primary">
              <CountryFlag code={destination.country_code} countryName={countryName} />
              <span>{regionName ? `${regionName}, ${countryName}` : countryName}</span>
            </span>
          );
        })}
      </div>
    </section>
  );
}
