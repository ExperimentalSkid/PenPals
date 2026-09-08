"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import LanguageFlag from "@/app/components/LanguageFlag";
import InlineSearchList from "../shared/InlineSearchList";

const RETURN_QUERY_KEY = "penpal.discover.return";

export type FilterOption = { value: string; label: string; country?: string; searchAliases?: string[] };

type DiscoverFiltersProps = {
  filters: Record<string, string>;
  countries: FilterOption[];
  regions: FilterOption[];
  genders: FilterOption[];
  languages: FilterOption[];
  interests: FilterOption[];
};

type OpenFilter = "country" | "region" | "gender" | "age" | "language_spoken" | "language_learning" | "interest" | null;

type FilterIconName = "country" | "region" | "gender" | "age" | "spoken" | "learning" | "interest" | "recent";

function FilterIcon({ name }: { name: FilterIconName }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0" {...common}>
      {name === "country" && <><circle cx="12" cy="12" r="8.5" /><path d="M3.8 12h16.4M12 3.5c2.2 2.4 3.3 5.2 3.3 8.5S14.2 18.1 12 20.5c-2.2-2.4-3.3-5.2-3.3-8.5S9.8 5.9 12 3.5Z" /></>}
      {name === "region" && <><path d="M12 20s6-5.1 6-10a6 6 0 1 0-12 0c0 4.9 6 10 6 10Z" /><circle cx="12" cy="10" r="2" /></>}
      {name === "gender" && <><circle cx="12" cy="8" r="3" /><path d="M6.5 20c.6-3.1 2.4-4.7 5.5-4.7s4.9 1.6 5.5 4.7M18 5.5h3m-1.5-1.5v3" /></>}
      {name === "age" && <><rect x="4" y="5.5" width="16" height="15" rx="2" /><path d="M8 3.5v4M16 3.5v4M4 10h16" /></>}
      {name === "spoken" && <><path d="M4 5.5h16v10H9l-4 3v-13Z" /><path d="M8 9h8M8 12h5" /></>}
      {name === "learning" && <><path d="m4 5 8-2 8 2-8 2-8-2Z" /><path d="M6 7v7c2.4 1.5 4.4 1.8 6 1.8s3.6-.3 6-1.8V7M12 7v11" /></>}
      {name === "interest" && <><path d="m12 3 1.6 5.2L19 10l-5.4 1.8L12 17l-1.6-5.2L5 10l5.4-1.8L12 3Z" /><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z" /></>}
      {name === "recent" && <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3.5 2" /></>}
    </svg>
  );
}

function ageValidation(minValue: string, maxValue: string) {
  const min = minValue ? Number(minValue) : null;
  const max = maxValue ? Number(maxValue) : null;
  const invalid = (min !== null && (!Number.isInteger(min) || min < 13 || min > 100))
    || (max !== null && (!Number.isInteger(max) || max < 13 || max > 100))
    || (min !== null && max !== null && min > max);
  return invalid ? "Choose ages from 13 to 100, with From no greater than To." : "";
}

type ToolbarButtonProps = {
  id: string;
  label: string;
  icon: FilterIconName;
  value?: string;
  open: boolean;
  onOpen: () => void;
  onClear?: () => void;
};

function ToolbarButton({ id, label, icon, value, open, onOpen, onClear }: ToolbarButtonProps) {
  const active = Boolean(value);
  return (
    <div className="flex items-stretch">
      <button
        type="button"
        onClick={onOpen}
        aria-expanded={open}
        aria-controls={id}
        className={`inline-flex min-h-11 items-center gap-2 rounded-md border px-4 text-[15px] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#087456] ${active ? "rounded-l-md border-[#087456]/45 border-r-0 bg-[#e8eee8] text-[#075d46]" : "border-[#d7d7cf] bg-[#fbfaf6] text-[#33443e] hover:border-[#087456]/50"}`}
      >
        <FilterIcon name={icon} />
        <span>{value ? `${label}: ${value}` : label}</span>
        <span aria-hidden="true" className="ml-1 text-black/35">⌄</span>
      </button>
      {active && onClear && (
        <button
          type="button"
          onClick={onClear}
          aria-label={`Clear ${label}`}
          className="rounded-r-md border border-[#087456]/45 bg-[#e8eee8] px-2.5 text-[#075d46] transition hover:bg-[#dfe9df] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#087456]"
        >
          <span aria-hidden="true">×</span>
        </button>
      )}
    </div>
  );
}

function selectedLabel(options: FilterOption[], value: string) {
  if (!value) return undefined;
  return options.find((option) => option.value === value)?.label ?? value;
}

export default function DiscoverFilters({ filters, countries, regions, genders, languages, interests }: DiscoverFiltersProps) {
  const [values, setValues] = useState(() => ({
    country: filters.country,
    region: filters.region,
    gender: filters.gender,
    language_spoken: filters.language_spoken,
    language_learning: filters.language_learning,
    interest: filters.interest,
  }));
  const [minAge, setMinAge] = useState(filters.min_age);
  const [maxAge, setMaxAge] = useState(filters.max_age);
  const [recent, setRecent] = useState(filters.recent === "1" || filters.recent === "true");
  const [ageError, setAgeError] = useState("");
  const [openFilter, setOpenFilter] = useState<OpenFilter>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!toolbarRef.current?.contains(event.target as Node)) setOpenFilter(null);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  // Regions are meaningful only within a selected country.  Keeping this
  // list empty until a country is chosen prevents a region-only filter from
  // being created in the UI and keeps the URL hierarchy canonical.
  const regionOptions = useMemo(() => values.country
    ? regions.filter((option) => option.country?.toUpperCase() === values.country.toUpperCase())
    : [], [regions, values.country]);

  const setValue = (name: keyof typeof values, value: string) => {
    setValues((current) => ({ ...current, [name]: value }));
  };

  const setCountry = (value: string) => {
    setValues((current) => ({ ...current, country: value, region: "" }));
  };

  const toggleFilter = (filter: Exclude<OpenFilter, null>) => {
    setOpenFilter((current) => current === filter ? null : filter);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    const error = ageValidation(minAge, maxAge);
    if (error) {
      event.preventDefault();
      setAgeError(error);
      setOpenFilter("age");
      setMobileOpen(true);
      return;
    }
    setAgeError("");
  };

  const activeCount = Object.values(values).filter(Boolean).length + (minAge || maxAge ? 1 : 0) + (recent ? 1 : 0);
  const activeAgeLabel = minAge || maxAge ? `${minAge || "13"}–${maxAge || "100"}` : undefined;
  const editorId = "discover-filter-editor";
  const selected = (name: keyof typeof values) => values[name] ? [values[name]] : [];

  return (
    <div ref={toolbarRef} className="mt-8">
      <form method="get" action="/app/discover" onSubmit={handleSubmit}>
        <div className="md:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen((current) => !current)}
            aria-expanded={mobileOpen}
            aria-controls="discover-filter-panel"
            className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/15 bg-[#fbfaf6] px-3 text-sm font-medium text-[#075d46] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#087456]"
          >
            Filters{activeCount > 0 ? ` (${activeCount})` : ""}
            <span aria-hidden="true">⌄</span>
          </button>
        </div>

        <div id="discover-filter-panel" className={`${mobileOpen ? "mt-3 block border border-black/10 bg-[#f1f0e8] p-4" : "hidden"} md:mt-4 md:block md:border-0 md:bg-transparent md:p-0`}>
          <div className="flex flex-wrap items-center gap-2">
            <ToolbarButton id={editorId} icon="country" label="Country" value={selectedLabel(countries, values.country)} open={openFilter === "country"} onOpen={() => toggleFilter("country")} onClear={() => setCountry("")} />
            <ToolbarButton id={editorId} icon="region" label="Region" value={selectedLabel(regions, values.region)} open={openFilter === "region"} onOpen={() => toggleFilter("region")} onClear={() => setValue("region", "")} />
            <ToolbarButton id={editorId} icon="gender" label="Gender" value={selectedLabel(genders, values.gender)} open={openFilter === "gender"} onOpen={() => toggleFilter("gender")} onClear={() => setValue("gender", "")} />
            <ToolbarButton id={editorId} icon="age" label="Age" value={activeAgeLabel} open={openFilter === "age"} onOpen={() => toggleFilter("age")} onClear={() => { setMinAge(""); setMaxAge(""); setAgeError(""); }} />
            <ToolbarButton id={editorId} icon="spoken" label="Language spoken" value={selectedLabel(languages, values.language_spoken)} open={openFilter === "language_spoken"} onOpen={() => toggleFilter("language_spoken")} onClear={() => setValue("language_spoken", "")} />
            <ToolbarButton id={editorId} icon="learning" label="Language learning" value={selectedLabel(languages, values.language_learning)} open={openFilter === "language_learning"} onOpen={() => toggleFilter("language_learning")} onClear={() => setValue("language_learning", "")} />
            <ToolbarButton id={editorId} icon="interest" label="Interest" value={selectedLabel(interests, values.interest)} open={openFilter === "interest"} onOpen={() => toggleFilter("interest")} onClear={() => setValue("interest", "")} />

            <button type="button" aria-pressed={recent} onClick={() => setRecent((current) => !current)} className={`inline-flex min-h-11 items-center gap-2 rounded-md border px-4 text-[15px] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#087456] ${recent ? "border-[#087456]/45 bg-[#e8eee8] text-[#075d46]" : "border-[#d7d7cf] bg-[#fbfaf6] text-[#33443e] hover:border-[#087456]/50"}`}>
              <FilterIcon name="recent" />
              Active recently
            </button>
          </div>

          {openFilter && (
            <div id={editorId} className="mt-4 border-y border-black/10 py-4" aria-label={`${openFilter} filter`}>
              {openFilter === "country" && (
                <InlineSearchList
                  label="countries"
                  options={countries}
                  selectedValues={selected("country")}
                  placeholder="Search countries…"
                  onSelect={(option) => { setCountry(option.value); setOpenFilter(null); }}
                  onEscape={() => setOpenFilter(null)}
                />
              )}
              {openFilter === "region" && (
                <InlineSearchList
                  label="regions"
                  options={regionOptions}
                  selectedValues={selected("region")}
                  placeholder={values.country ? "Search regions…" : "Choose a country first…"}
                  onSelect={(option) => { setValue("region", option.value); setOpenFilter(null); }}
                  onEscape={() => setOpenFilter(null)}
                />
              )}
              {openFilter === "language_spoken" && (
                <InlineSearchList
                  label="languages"
                  options={languages}
                  selectedValues={selected("language_spoken")}
                  placeholder="Search languages…"
                  renderOption={(option) => <span className="flex items-center gap-2"><LanguageFlag name={option.label} />{option.label}</span>}
                  onSelect={(option) => { setValue("language_spoken", option.value); setOpenFilter(null); }}
                  onEscape={() => setOpenFilter(null)}
                />
              )}
              {openFilter === "language_learning" && (
                <InlineSearchList
                  label="languages"
                  options={languages}
                  selectedValues={selected("language_learning")}
                  placeholder="Search languages…"
                  renderOption={(option) => <span className="flex items-center gap-2"><LanguageFlag name={option.label} />{option.label}</span>}
                  onSelect={(option) => { setValue("language_learning", option.value); setOpenFilter(null); }}
                  onEscape={() => setOpenFilter(null)}
                />
              )}
              {openFilter === "interest" && (
                <InlineSearchList
                  label="interests"
                  options={interests}
                  selectedValues={selected("interest")}
                  placeholder="Search interests…"
                  onSelect={(option) => { setValue("interest", option.value); setOpenFilter(null); }}
                  onEscape={() => setOpenFilter(null)}
                />
              )}
              {openFilter === "gender" && (
                <div role="listbox" aria-label="Gender options" className="max-w-sm divide-y divide-black/10 border-y border-black/10 bg-white/40">
                  {[{ value: "", label: "Any gender" }, ...genders].map((option) => (
                    <button
                      key={option.value || "any"}
                      type="button"
                      role="option"
                      aria-selected={option.value === values.gender}
                      onClick={() => { setValue("gender", option.value); setOpenFilter(null); }}
                      className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#087456] ${option.value === values.gender ? "bg-[#e8eee8] text-[#075d46]" : "text-[#16251f] hover:bg-white/70"}`}
                    >
                      <span>{option.label}</span>
                      {option.value === values.gender && <span aria-hidden="true">✓</span>}
                    </button>
                  ))}
                </div>
              )}
              {openFilter === "age" && (
                <div className="max-w-sm border-y border-black/10 bg-white/40 py-4">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs font-medium uppercase tracking-[.12em] text-black/50">
                      From
                      <input type="number" min="13" max="100" step="1" value={minAge} placeholder="13" aria-label="Minimum age" aria-describedby={ageError ? "discover-age-error" : undefined} className="field mt-2 h-10 w-full rounded-md px-3 py-2 text-sm" onChange={(event) => { setMinAge(event.target.value); setAgeError(ageValidation(event.target.value, maxAge)); }} />
                    </label>
                    <label className="text-xs font-medium uppercase tracking-[.12em] text-black/50">
                      To
                      <input type="number" min="13" max="100" step="1" value={maxAge} placeholder="100" aria-label="Maximum age" aria-describedby={ageError ? "discover-age-error" : undefined} className="field mt-2 h-10 w-full rounded-md px-3 py-2 text-sm" onChange={(event) => { setMaxAge(event.target.value); setAgeError(ageValidation(minAge, event.target.value)); }} />
                    </label>
                  </div>
                  {ageError && <p id="discover-age-error" className="mt-2 text-xs text-[#8d3e2f]" role="alert">{ageError}</p>}
                  <button type="button" onClick={() => setOpenFilter(null)} className="mt-3 rounded-md border border-[#087456]/35 px-3 py-2 text-sm font-medium text-[#075d46] hover:bg-[#e8eee8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#087456]">Apply</button>
                </div>
              )}
            </div>
          )}

          <input type="hidden" name="country" value={values.country} />
          <input type="hidden" name="region" value={values.region} />
          <input type="hidden" name="language_spoken" value={values.language_spoken} />
          <input type="hidden" name="language_learning" value={values.language_learning} />
          <input type="hidden" name="interest" value={values.interest} />
          <input type="hidden" name="gender" value={values.gender} />
          <input type="hidden" name="min_age" value={minAge} />
          <input type="hidden" name="max_age" value={maxAge} />
          <input type="hidden" name="recent" value={recent ? "1" : ""} />
          <input type="hidden" name="page" value="1" />
          <div className="mt-5 flex flex-wrap items-center gap-5">
            <button type="submit" className="btn-primary inline-flex min-h-11 items-center gap-2 rounded-md px-5 py-2.5 text-[15px]"><svg aria-hidden="true" viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m4 5 7.5 7.5M4 5l5.5 14 2-6 6-2L4 5Z" /></svg>Apply filters</button>
            <a href="/app/discover" onClick={() => window.sessionStorage.removeItem(RETURN_QUERY_KEY)} className="text-[15px] text-[#075d46] underline underline-offset-4 hover:text-[#054d3d]">Clear all</a>
          </div>
        </div>
      </form>
    </div>
  );
}
