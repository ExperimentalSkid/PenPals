"use client";

import { useTranslations } from "next-intl";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import InlineSearchList from "@/app/app/shared/InlineSearchList";
import { COUNTRY_OPTIONS } from "@/lib/countries";

type Region = { code: string; name: string; country_code: string; is_major?: boolean };
type Locality = { id: number; name: string; country_code: string; region_code?: string | null; is_major?: boolean };

type LocationEditorProps = {
  initialCountryCode?: string | null;
  initialRegionCode?: string | null;
  initialLocalityId?: number | null;
  initialPrecision?: string | null;
  initialCountry?: string | null;
  initialCity?: string | null;
  regions: Region[];
  localities: Locality[];
};

export default function LocationEditor({
  initialCountryCode,
  initialRegionCode,
  initialLocalityId,
  initialPrecision,
  initialCountry,
  initialCity,
  regions,
  localities,
}: LocationEditorProps) {
  const t = useTranslations();
  const resolvedCountry = initialCountryCode?.toUpperCase() || COUNTRY_OPTIONS.find((country) => country.name.toLowerCase() === initialCountry?.trim().toLowerCase())?.code || "";
  const initialHasRegionOptions = regions.some((region) => region.country_code === resolvedCountry);
  const resolvedInitialPrecision = initialPrecision || (initialLocalityId ? "locality" : initialRegionCode ? "region" : "country");
  const [countryCode, setCountryCode] = useState(resolvedCountry);
  const [regionCode, setRegionCode] = useState(initialRegionCode?.toUpperCase() || "");
  const [localityId, setLocalityId] = useState(initialLocalityId ? String(initialLocalityId) : "");
  const [localityName, setLocalityName] = useState(initialCity ?? "");
  const [localityOpen, setLocalityOpen] = useState(false);
  const [localityActiveIndex, setLocalityActiveIndex] = useState(-1);
  const countryFieldRef = useRef<HTMLInputElement>(null);
  const cityFieldRef = useRef<HTMLInputElement>(null);
  const countryCodeFieldRef = useRef<HTMLInputElement>(null);
  const regionCodeFieldRef = useRef<HTMLInputElement>(null);
  const localityIdFieldRef = useRef<HTMLInputElement>(null);
  // A new profile only needs a country to enter the app. Preserve the more
  // precise choice for profiles that already have normalized children, but do
  // not force a new user into a region/city flow before they can save.
  const [precision, setPrecision] = useState(resolvedInitialPrecision !== "country" && !initialHasRegionOptions ? "country" : resolvedInitialPrecision);

  const country = COUNTRY_OPTIONS.find((option) => option.code === countryCode);
  const countryRegions = useMemo(
    () => regions.filter((region) => region.country_code === countryCode).sort((a, b) => Number(Boolean(b.is_major)) - Number(Boolean(a.is_major)) || a.name.localeCompare(b.name)),
    [countryCode, regions],
  );
  const scopedLocalities = useMemo(
    () => localities
      .filter((locality) => locality.country_code === countryCode && (!regionCode || locality.region_code === regionCode))
      .sort((a, b) => Number(Boolean(b.is_major)) - Number(Boolean(a.is_major)) || a.name.localeCompare(b.name)),
    [countryCode, localities, regionCode],
  );
  const selectedRegion = countryRegions.find((region) => region.code === regionCode);
  const hasRegionOptions = countryRegions.length > 0;

  useEffect(() => {
    if (countryFieldRef.current) countryFieldRef.current.value = country?.name || initialCountry || initialCountryCode || "";
    if (cityFieldRef.current) cityFieldRef.current.value = precision === "locality" ? localityName : "";
    if (countryCodeFieldRef.current) countryCodeFieldRef.current.value = countryCode;
    if (regionCodeFieldRef.current) regionCodeFieldRef.current.value = precision === "country" ? "" : regionCode;
    if (localityIdFieldRef.current) localityIdFieldRef.current.value = precision === "locality" ? localityId : "";
  }, [country?.name, countryCode, initialCountry, initialCountryCode, localityId, localityName, precision, regionCode]);

  const localitySuggestions = useMemo(
    () => scopedLocalities
      .filter((locality) => locality.name.toLocaleLowerCase().includes(localityName.trim().toLocaleLowerCase()))
      .slice(0, 8),
    [localityName, scopedLocalities],
  );
  const safeLocalityActiveIndex = localityActiveIndex >= 0 && localityActiveIndex < localitySuggestions.length
    ? localityActiveIndex
    : localitySuggestions.length ? 0 : -1;

  const selectLocality = (locality: Locality) => {
    setLocalityId(String(locality.id));
    setLocalityName(locality.name);
    setLocalityOpen(false);
    setLocalityActiveIndex(-1);
  };

  const handleLocalityKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setLocalityOpen(true);
      setLocalityActiveIndex(localitySuggestions.length ? (safeLocalityActiveIndex + 1) % localitySuggestions.length : -1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setLocalityOpen(true);
      setLocalityActiveIndex(localitySuggestions.length
        ? (safeLocalityActiveIndex <= 0 ? localitySuggestions.length - 1 : safeLocalityActiveIndex - 1)
        : -1);
      return;
    }
    if (event.key === "Enter" && localitySuggestions[safeLocalityActiveIndex]) {
      event.preventDefault();
      selectLocality(localitySuggestions[safeLocalityActiveIndex]);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setLocalityOpen(false);
      setLocalityActiveIndex(-1);
    }
  };

  const selectCountry = (code: string) => {
    const nextHasRegionOptions = regions.some((region) => region.country_code === code);
    setCountryCode(code);
    setRegionCode("");
    setLocalityId("");
    setLocalityName("");
    if (!nextHasRegionOptions) setPrecision("country");
    setLocalityOpen(false);
    setLocalityActiveIndex(-1);
  };
  const selectRegion = (code: string) => {
    setRegionCode(code);
    setLocalityId("");
    setLocalityName("");
    setLocalityOpen(false);
    setLocalityActiveIndex(-1);
  };

  return (
    <div className="space-y-7">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
        <p className="text-sm font-medium text-primary">{t("app.profile.country")} <span className="text-xs font-normal text-black/45">{t("app.profile.requiredLabel")}</span></p>
        <InlineSearchList
          label={t("app.profile.country")}
          options={COUNTRY_OPTIONS.map((option) => ({ value: option.code, label: option.name, searchAliases: option.aliases }))}
          selectedValues={countryCode ? [countryCode] : []}
          placeholder={t("app.discover.searchCountries")}
          autoFocus={false}
          onSelect={(option) => selectCountry(option.value)}
        />
          <p className="mt-2 text-sm text-muted" aria-live="polite">{country ? <>{t("app.profile.selected")} <span className="font-medium text-[#102A43]">{country.name}</span></> : t("app.profile.chooseCountryContinue")}</p>
        </div>

        <div>
        <label htmlFor="location-precision" className="text-sm font-medium text-primary">{t("app.profile.locationDetail")} <span className="text-xs font-normal text-black/45">{t("app.profile.requiredLabel")}</span></label>
        <select
          id="location-precision"
          name="location_precision"
          value={precision}
          onChange={(event) => {
            const next = event.target.value;
            if (next !== "country" && !hasRegionOptions) return;
            setPrecision(next);
            if (next === "country") {
              setRegionCode("");
              setLocalityId("");
              setLocalityName("");
              setLocalityOpen(false);
              setLocalityActiveIndex(-1);
            } else if (next === "region") {
              setLocalityId("");
              setLocalityName("");
              setLocalityOpen(false);
              setLocalityActiveIndex(-1);
            }
          }}
          className="field mt-2 w-full rounded-md bg-[#fffdfa]"
        >
          <option value="country">{t("app.profile.countryOnly")}</option>
          <option value="region" disabled={!hasRegionOptions}>{t("app.profile.region")}{!hasRegionOptions ? ` (${t("app.profile.notAvailable")})` : ""}</option>
          <option value="locality" disabled={!hasRegionOptions}>{t("app.profile.city")}{!hasRegionOptions ? ` (${t("app.profile.notAvailable")})` : ""}</option>
        </select>
        <p className="mt-2 text-xs leading-5 text-muted">{!countryCode ? t("app.profile.chooseCountryLocation") : hasRegionOptions ? t("app.profile.chooseLocationDetail") : t("app.profile.countryOnlyAvailable")}</p>
        </div>
      </div>

      {precision !== "country" && (
      <div>
          <p className="text-sm font-medium text-primary">{t("app.profile.region")} <span className="font-normal text-black/45">{t("app.profile.regionRequired")}</span></p>
          {countryCode && countryRegions.length > 0 ? (
            <InlineSearchList
              label={t("app.profile.region")}
              options={countryRegions.map((region) => ({ value: region.code, label: region.name }))}
              selectedValues={regionCode ? [regionCode] : []}
              placeholder={t("app.discover.searchRegions")}
              autoFocus={false}
              onSelect={(option) => selectRegion(option.value)}
            />
          ) : <p className="mt-2 text-sm text-black/45">{t("app.profile.regionHint")}</p>}
          {selectedRegion && <p className="mt-2 text-sm text-black/55">{selectedRegion.name}</p>}
        </div>
      )}

      {precision === "locality" && (
        <div>
          <label htmlFor="location-city" className="text-sm font-medium text-primary">{t("app.profile.city")} <span className="text-xs font-normal text-black/45">{t("app.profile.cityRequired")}</span></label>
          <input
            id="location-city"
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={localityOpen && localitySuggestions.length > 0}
            aria-controls="location-city-options"
            aria-activedescendant={localityOpen && safeLocalityActiveIndex >= 0 ? `location-city-option-${safeLocalityActiveIndex}` : undefined}
            value={localityName}
            onChange={(event) => {
              setLocalityName(event.target.value);
              setLocalityId("");
              setLocalityOpen(true);
              setLocalityActiveIndex(0);
            }}
            onFocus={() => setLocalityOpen(Boolean(localityName.trim()))}
            onKeyDown={handleLocalityKeyDown}
            className="field mt-2 w-full rounded-md bg-[#fffdfa]"
            placeholder={t("app.profile.cityPlaceholder")}
            required={Boolean(countryCode && regionCode)}
            disabled={!countryCode || !regionCode}
          />
          {countryCode && localityOpen && localitySuggestions.length > 0 && !localityId && (
            <div id="location-city-options" className="mt-2 divide-y divide-black/10 border-y border-black/10 bg-white/40" role="listbox" aria-label={t("app.profile.citySuggestions")}>
              {localitySuggestions.map((locality, index) => (
                <button
                  key={locality.id}
                  id={`location-city-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={index === safeLocalityActiveIndex}
                  className={`block w-full px-3 py-2.5 text-left text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#087456] ${index === safeLocalityActiveIndex ? "bg-[#f0f1e9] text-brand" : "text-primary hover:bg-white/70"}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectLocality(locality)}
                >
                  {locality.name}
                </button>
              ))}
            </div>
          )}
          <p className="mt-2 text-xs leading-5 text-black/50">{regionCode ? t("app.profile.localityHint") : t("app.profile.chooseRegionBeforeCity")}</p>
        </div>
      )}

      <input ref={countryFieldRef} type="hidden" name="country" defaultValue={country?.name || initialCountry || initialCountryCode || ""} />
      <input ref={cityFieldRef} type="hidden" name="city" defaultValue={precision === "locality" ? localityName : ""} />
      <input ref={countryCodeFieldRef} type="hidden" name="country_code" defaultValue={countryCode} />
      <input ref={regionCodeFieldRef} type="hidden" name="region_code" defaultValue={precision === "country" ? "" : regionCode} />
      <input ref={localityIdFieldRef} type="hidden" name="locality_id" defaultValue={precision === "locality" ? localityId : ""} />
    </div>
  );
}
