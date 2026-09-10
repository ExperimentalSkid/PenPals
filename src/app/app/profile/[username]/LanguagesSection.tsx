import LanguageFlag from "@/app/components/LanguageFlag";
import { formatLanguageProficiency, languageNameFromRelation } from "@/lib/language-compatibility";

export type LanguageRelation = { name?: string | null };
export type ProfileLanguage = {
  language_id: number;
  proficiency?: string | null;
  purpose?: string | null;
  languages?: LanguageRelation | LanguageRelation[] | null;
};

export function humanProficiency(proficiency?: string | null, purpose?: string | null) {
  // Learning is an intent, not a claim of current fluency.
  if (purpose === "learning") return "Learning";
  return formatLanguageProficiency(proficiency, purpose);
}

export default function LanguagesSection({ languages }: { languages: ProfileLanguage[] }) {
  if (languages.length === 0) return null;

  return (
    <section aria-labelledby="languages-heading" className="border-t border-black/10 pt-7">
      <h2 id="languages-heading" className="flex items-center gap-3 font-sans text-[11px] font-semibold uppercase tracking-[.18em] text-primary">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="8.5" />
          <path d="M3.8 12h16.4M12 3.5c2.2 2.4 3.3 5.2 3.3 8.5S14.2 18.1 12 20.5c-2.2-2.4-3.3-5.9-3.3-8.5S9.8 5.9 12 3.5Z" />
        </svg>
        Languages
      </h2>
      <div className="mt-5 divide-y divide-black/[0.08]">
        {languages.map((language) => {
          const name = languageNameFromRelation(language.languages);
          const level = humanProficiency(language.proficiency, language.purpose);
          return (
            <div key={`${language.language_id}-${language.purpose ?? "unknown"}`} className="flex items-center justify-between gap-4 py-3 text-[15px]">
              <span className="flex min-w-0 items-center gap-3 text-black/75">
                <LanguageFlag name={name} />
                <span className="truncate">{name}</span>
              </span>
              {level && <span className="shrink-0 text-right font-serif italic text-black/50">{level}</span>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
