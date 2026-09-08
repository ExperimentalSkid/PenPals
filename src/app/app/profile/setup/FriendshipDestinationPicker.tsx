"use client";

import { useMemo, useState } from "react";
import InlineSearchList from "@/app/app/shared/InlineSearchList";
import { COUNTRY_OPTIONS } from "@/lib/countries";

type Region = { code: string; name: string; country_code: string; is_major?: boolean };
type Destination = { country_code: string; region_code?: string | null };

const DEFAULT_MAX_DESTINATIONS = 5;

export default function FriendshipDestinationPicker({ initialDestinations, regions, maxDestinations = DEFAULT_MAX_DESTINATIONS }: { initialDestinations: Destination[]; regions: Region[]; maxDestinations?: number }) {
  const destinationLimit = Number.isInteger(maxDestinations) && maxDestinations > 0 ? maxDestinations : DEFAULT_MAX_DESTINATIONS;
  const [destinations, setDestinations] = useState<Destination[]>(() => initialDestinations.map((destination) => ({
    country_code: destination.country_code.trim().toUpperCase(),
    region_code: destination.region_code?.trim().toUpperCase() || null,
  })));
  const [countryCode, setCountryCode] = useState("");
  const [regionCode, setRegionCode] = useState("");
  const [selectionMessage, setSelectionMessage] = useState<string | null>(null);
  const countryRegions = useMemo(
    () => regions.filter((region) => region.country_code === countryCode).sort((a, b) => Number(Boolean(b.is_major)) - Number(Boolean(a.is_major)) || a.name.localeCompare(b.name)),
    [countryCode, regions],
  );
  const countryName = (code: string) => COUNTRY_OPTIONS.find((country) => country.code === code.trim().toUpperCase())?.name ?? code;
  const regionName = (code: string | null | undefined) => regions.find((region) => region.code === code?.trim().toUpperCase())?.name ?? code;

  const addDestination = (nextRegionCode: string | null = null) => {
    const normalizedRegionCode = nextRegionCode?.trim().toUpperCase() || null;
    if (!countryCode) {
      setSelectionMessage("Choose a destination country first.");
      return;
    }
    if (destinations.length >= destinationLimit) {
      setSelectionMessage(`You can choose up to ${destinationLimit} destinations.`);
      return;
    }
    if (destinations.some((item) => item.country_code === countryCode && (item.region_code ?? null) === normalizedRegionCode)) {
      setSelectionMessage("That destination is already selected.");
      return;
    }
    setDestinations((current) => [...current, { country_code: countryCode, region_code: normalizedRegionCode }]);
    setSelectionMessage(null);
    setCountryCode("");
    setRegionCode("");
  };

  return (
    <div>
      {selectionMessage && <p className="mt-3 text-sm text-[#8a5a18]" role="alert">{selectionMessage}</p>}
      {destinations.length < destinationLimit && (
        <div className="mt-4 space-y-4">
          <InlineSearchList
            label="destination countries"
            options={COUNTRY_OPTIONS.map((country) => ({ value: country.code, label: country.name, searchAliases: country.aliases }))}
            selectedValues={[]}
            placeholder="Search destination countries…"
            autoFocus={false}
            onSelect={(option) => {
              setCountryCode(option.value);
              setRegionCode("");
              setSelectionMessage(null);
            }}
          />
          {countryCode && (
            <div className="border-l border-black/10 pl-4">
              <p className="text-sm text-black/60">{countryName(countryCode)} <span className="text-black/40">(optional region)</span></p>
              {countryRegions.length > 0 ? (
                <InlineSearchList
                  label="destination regions"
                  options={countryRegions.map((region) => ({ value: region.code, label: region.name }))}
                  selectedValues={regionCode ? [regionCode] : []}
                  placeholder="Search a region or add the whole country…"
                  autoFocus={false}
                  onSelect={(option) => {
                    setRegionCode(option.value);
                    setSelectionMessage(null);
                  }}
                />
              ) : null}
              <div className="mt-3 flex flex-wrap gap-3">
                <button type="button" onClick={() => addDestination(null)} className="rounded-md border border-black/15 px-3 py-2 text-sm text-[#075d46] hover:border-[#075d46]">Add country</button>
                {regionCode && <button type="button" onClick={() => addDestination(regionCode)} className="rounded-md border border-[#087456]/40 bg-[#e8eee8] px-3 py-2 text-sm text-[#075d46] hover:border-[#075d46]">Add region</button>}
              </div>
            </div>
          )}
        </div>
      )}
      {destinations.length >= destinationLimit && <p className="mt-4 text-sm text-black/50">You&apos;ve reached the {destinationLimit}-destination limit. Remove one to choose another.</p>}
      {destinations.length > 0 && (
        <div className="mt-5 divide-y divide-black/10 border-y border-black/10">
          {destinations.map((destination, index) => (
            <div key={`${destination.country_code}-${destination.region_code ?? "country"}`} className="flex items-center justify-between gap-4 py-3 text-sm">
              <span>{countryName(destination.country_code)}{destination.region_code ? ` · ${regionName(destination.region_code)}` : ""}</span>
              <button type="button" onClick={() => { setDestinations((current) => current.filter((_, itemIndex) => itemIndex !== index)); setSelectionMessage(null); }} className="text-xs text-black/50 hover:text-black/80">Remove destination</button>
            </div>
          ))}
        </div>
      )}
      <input key={`destinations-${JSON.stringify(destinations)}`} type="hidden" name="friendship_destinations" value={JSON.stringify(destinations)} />
    </div>
  );
}
