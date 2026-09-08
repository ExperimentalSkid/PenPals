"use client";

import { useState } from "react";
import InlineSearchList from "../shared/InlineSearchList";
import CountryFlag from "@/app/components/CountryFlag";

type Country = { code: string; name: string; aliases?: string[] };

export default function CountryExclusionPicker({ countries, initialSelected }: { countries: Country[]; initialSelected: string[] }) {
  const [selected, setSelected] = useState(initialSelected);

  return (
    <div>
      <InlineSearchList
        inputId="country-search"
        autoFocus={false}
        label="countries"
        options={countries.map((country) => ({ value: country.code, label: country.name, searchAliases: country.aliases }))}
        selectedValues={selected}
        placeholder="Search countries…"
        renderOption={(option) => <span className="flex items-center gap-2"><CountryFlag code={option.value} countryName={option.label} /><span>{option.label}</span></span>}
        onSelect={(option) => setSelected((current) => current.includes(option.value) ? current : [...current, option.value])}
      />
      <div className="mt-4 space-y-2">
        {selected.map((code) => {
          const country = countries.find((item) => item.code === code);
          return <div key={code} className="flex items-center justify-between border-b border-black/10 py-2 text-sm"><span className="flex items-center gap-2"><CountryFlag code={code} countryName={country?.name ?? code} /><span>{country?.name ?? code}</span></span><button type="button" aria-label={`Remove ${country?.name ?? code}`} onClick={() => setSelected((current) => current.filter((item) => item !== code))} className="text-xs text-black/50 hover:text-black/80">Remove</button><input type="hidden" name="excluded_countries" value={code} /></div>;
        })}
      </div>
    </div>
  );
}
