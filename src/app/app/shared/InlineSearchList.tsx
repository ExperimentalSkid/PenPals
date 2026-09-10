"use client";

import { useId, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { KeyboardEvent, ReactNode } from "react";

export type InlineSearchOption = {
  value: string;
  label: string;
  searchAliases?: string[];
};

function normalizeSearchText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
}

type InlineSearchListProps = {
  inputId?: string;
  label: string;
  options: InlineSearchOption[];
  placeholder: string;
  selectedValues?: string[];
  maxResults?: number;
  autoFocus?: boolean;
  renderOption?: (option: InlineSearchOption) => ReactNode;
  onSelect: (option: InlineSearchOption) => void;
  onEscape?: () => void;
};

/**
 * Searchable list used by settings and discovery. The result list intentionally
 * lives in normal document flow so opening it moves the content below it.
 */
export default function InlineSearchList({
  inputId: providedInputId,
  label,
  options,
  placeholder,
  selectedValues = [],
  maxResults = 8,
  autoFocus = true,
  renderOption,
  onSelect,
  onEscape,
}: InlineSearchListProps) {
  const t = useTranslations();
  const generatedId = useId();
  const inputId = providedInputId ?? `inline-search-${generatedId}`;
  const listId = `${inputId}-options`;
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);

  const results = useMemo(() => {
    const term = normalizeSearchText(query.trim());
    if (!term) return [];
    return options
      .filter((option) => !selectedValues.includes(option.value))
      .filter((option) => [option.label, ...(option.searchAliases ?? [])].some((value) => normalizeSearchText(value).includes(term)))
      .slice(0, maxResults);
  }, [maxResults, options, query, selectedValues]);

  const safeActiveIndex = activeIndex >= 0 && activeIndex < results.length
    ? activeIndex
    : results.length ? 0 : -1;

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex(results.length ? (safeActiveIndex + 1) % results.length : -1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(results.length
        ? (safeActiveIndex <= 0 ? results.length - 1 : safeActiveIndex - 1)
        : -1);
      return;
    }
    if (event.key === "Enter") {
      const option = results[safeActiveIndex] ?? (results.length === 1 ? results[0] : undefined);
      if (!option) return;
      event.preventDefault();
      onSelect(option);
      setQuery("");
      setActiveIndex(-1);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setQuery("");
      setActiveIndex(-1);
      onEscape?.();
    }
  };

  return (
    <div>
      <label htmlFor={inputId} className="sr-only">{t("common.searchFor", { label })}</label>
      <input
        id={inputId}
        type="text"
        role="combobox"
        aria-label={t("common.searchFor", { label })}
        aria-autocomplete="list"
        aria-expanded={results.length > 0}
        aria-controls={listId}
        aria-activedescendant={safeActiveIndex >= 0 ? `${listId}-option-${safeActiveIndex}` : undefined}
        value={query}
        placeholder={placeholder}
        autoComplete="off"
        autoFocus={autoFocus}
        className="field mt-3 w-full sm:max-w-md"
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(0);
        }}
        onKeyDown={handleKeyDown}
      />
      {results.length > 0 && (
        <div
          id={listId}
          className="mt-2 divide-y divide-black/10 border-y border-black/10 bg-white/40"
          role="listbox"
          aria-label={t("common.optionsFor", { label })}
        >
          {results.map((option, index) => (
            <button
              id={`${listId}-option-${index}`}
              key={option.value}
              type="button"
              role="option"
              aria-selected={selectedValues.includes(option.value)}
              className={`block w-full px-3 py-2.5 text-left text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#087456] ${index === safeActiveIndex ? "bg-[#f0f1e9] text-brand" : "text-primary hover:bg-white/70"}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onSelect(option);
                setQuery("");
                setActiveIndex(-1);
              }}
            >
              {renderOption ? renderOption(option) : option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
