"use client";

import { useTranslations } from "next-intl";

import { useId, useMemo, useState, type KeyboardEvent } from "react";
import LanguageFlag from "@/app/components/LanguageFlag";
import InlineSearchList from "../shared/InlineSearchList";

type Language = { id: number; name: string };
type Interest = { id: number; name: string };
type Choice = { language_id: number; proficiency: string; purpose: string };
type ProfileChoicesProps = { languages: Language[]; interests: Interest[]; initialLanguages: Choice[]; initialInterests: number[]; section?: "both" | "languages" | "interests" };

export default function ProfileChoices({ languages, interests, initialLanguages, initialInterests, section = "both" }: ProfileChoicesProps) {
  const t = useTranslations();
  const showLanguages = section !== "interests";
  const showInterests = section !== "languages";
  const [query, setQuery] = useState("");
  const [choices, setChoices] = useState(initialLanguages);
  const [chosen, setChosen] = useState(initialInterests);
  const visible = useMemo(() => languages.filter((language) => language.name.toLowerCase().includes(query.toLowerCase())).slice(0, 8), [languages, query]);
  const [activeLanguageIndex, setActiveLanguageIndex] = useState(-1);
  const languageInputId = `language-search-${useId()}`;
  const languageListId = `${languageInputId}-options`;

  const update = (id: number, key: "proficiency" | "purpose", value: string) => setChoices((current) => current.map((choice) => choice.language_id === id ? { ...choice, [key]: value } : choice));
  const addLanguage = (id: number) => {
    if (!choices.some((choice) => choice.language_id === id)) setChoices((current) => [...current, { language_id: id, proficiency: "beginner", purpose: "learning" }]);
    setQuery("");
    setActiveLanguageIndex(-1);
  };

  const handleLanguageKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!query || !visible.length) {
      if (event.key === "Escape") {
        event.preventDefault();
        setQuery("");
        setActiveLanguageIndex(-1);
      }
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveLanguageIndex((current) => (current + 1) % visible.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveLanguageIndex((current) => (current <= 0 ? visible.length - 1 : current - 1));
    } else if (event.key === "Enter" && activeLanguageIndex >= 0) {
      event.preventDefault();
      addLanguage(visible[activeLanguageIndex].id);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setQuery("");
      setActiveLanguageIndex(-1);
    }
  };

  return <div className="space-y-10">
    {showLanguages && <fieldset>
      <legend className="subsection-title">{t("app.profile.spokenLearning")}</legend>
      <p className="section-description mt-2">{t("app.profile.spokenLearningHelp")}</p>
      <div className="relative mt-4"><label htmlFor={languageInputId} className="sr-only">{t("app.profile.searchLanguages")}</label><input id={languageInputId} role="combobox" aria-autocomplete="list" aria-expanded={visible.length > 0} aria-controls={languageListId} aria-activedescendant={activeLanguageIndex >= 0 && activeLanguageIndex < visible.length ? `${languageListId}-option-${activeLanguageIndex}` : undefined} value={query} onChange={(event) => { setQuery(event.target.value); setActiveLanguageIndex(event.target.value ? 0 : -1); }} onKeyDown={handleLanguageKeyDown} placeholder={t("app.profile.searchLanguages")} autoComplete="off" className="field w-full rounded-md bg-[#fffdfa]" />{query && <div id={languageListId} role="listbox" aria-label={t("app.profile.searchLanguages")} className="absolute inset-x-0 top-full z-10 mt-1 divide-y divide-black/[0.06] border border-black/10 bg-[#fffdfa] shadow-sm">{visible.length ? visible.map((language, index) => <button id={`${languageListId}-option-${index}`} type="button" role="option" aria-selected={index === activeLanguageIndex} key={language.id} onMouseDown={(event) => event.preventDefault()} onClick={() => addLanguage(language.id)} className={`flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-black/75 hover:bg-[#eef0e8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#087456] ${index === activeLanguageIndex ? "bg-[#eef0e8] text-brand" : ""}`}><LanguageFlag name={language.name} />{language.name}</button>) : <p className="px-4 py-3 text-sm text-black/45">{t("app.profile.noLanguagesFound")}</p>}</div>}</div>
      {choices.length ? <div className="mt-5 divide-y divide-black/[0.08] border-y border-black/[0.08]" role="list" aria-label={t("app.profile.selectedLanguages")}>{choices.map((choice) => { const languageName = languages.find((language) => language.id === choice.language_id)?.name ?? t("app.profile.language"); return <div key={choice.language_id} role="listitem" className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center"><span className="flex items-center gap-2 text-sm font-medium text-primary"><LanguageFlag name={languageName} />{languageName}</span><label className="flex items-center gap-2 text-xs text-black/50"><span className="sr-only">Proficiency for {languageName}</span><select aria-label={t("app.profile.proficiencyFor", { name: languageName })} value={choice.proficiency} onChange={(event) => update(choice.language_id, "proficiency", event.target.value)} className="rounded-md border border-black/10 bg-[#fffdfa] px-2.5 py-2 text-xs text-black/70">{["native", "fluent", "intermediate", "beginner"].map((level) => <option key={level} value={level}>{t(`app.profile.levels.${level}`)}</option>)}</select></label><label className="flex items-center gap-2 text-xs text-black/50"><span className="sr-only">Purpose for {languageName}</span><select aria-label={t("app.profile.purposeFor", { name: languageName })} value={choice.purpose} onChange={(event) => update(choice.language_id, "purpose", event.target.value)} className="rounded-md border border-black/10 bg-[#fffdfa] px-2.5 py-2 text-xs text-black/70"><option value="speaks">{t("app.profile.speaks")}</option><option value="learning">{t("app.profile.learning")}</option></select></label><button type="button" onClick={() => setChoices((current) => current.filter((item) => item.language_id !== choice.language_id))} className="justify-self-start px-2 py-1 text-sm text-black/40 hover:text-red-700 sm:justify-self-auto" aria-label={t("app.profile.remove", { name: languageName })}>×</button></div>; })}</div> : <p className="mt-5 text-sm text-black/45">{t("app.profile.noLanguagesSelected")}</p>}
      <input key={`languages-${JSON.stringify(choices)}`} type="hidden" name="languages" value={JSON.stringify(choices)} />
    </fieldset>}

    {showInterests && <fieldset>
      <legend className="subsection-title">{t("app.profile.chooseInterests")}</legend>
      <InlineSearchList
        label={t("app.profile.interests")}
        options={interests.map((interest) => ({ value: String(interest.id), label: interest.name }))}
        selectedValues={chosen.map(String)}
        placeholder={t("app.profile.searchInterests")}
        autoFocus={false}
        onSelect={(option) => {
          const id = Number(option.value);
          if (Number.isSafeInteger(id)) setChosen((current) => current.includes(id) ? current : [...current, id]);
        }}
      />
      {chosen.length ? <div className="mt-5 flex flex-wrap gap-2" role="list" aria-label={t("app.profile.selectedInterests")}>{chosen.map((id) => {
        const interest = interests.find((item) => item.id === id);
        if (!interest) return null;
        return <span key={id} role="listitem" className="inline-flex items-center gap-2 rounded-full border border-[#075d46]/35 bg-[#e8eee8] px-3 py-1.5 text-sm text-brand">
          {interest.name}
          <button type="button" onClick={() => setChosen((current) => current.filter((item) => item !== id))} className="rounded-full px-1 text-brand/70 hover:bg-[#d8e5d9] hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#087456]" aria-label={t("app.profile.remove", { name: interest.name })}>×</button>
        </span>;
      })}</div> : <p className="mt-5 text-sm text-black/45">{t("app.profile.noInterestsSelected")}</p>}
      <input key={`interests-${chosen.join(",")}`} type="hidden" name="interests" value={chosen.join(",")} />
    </fieldset>}
  </div>;
}
