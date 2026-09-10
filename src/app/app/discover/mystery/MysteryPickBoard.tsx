"use client";

import { useTranslations } from "next-intl";

import { useState } from "react";
import { resolveMysteryPick } from "./actions";

type MysteryCard = { token: string; position: number };

function SealedLetter() {
  return (
    <svg aria-hidden="true" viewBox="0 0 96 72" className="h-16 w-20 text-brand sm:h-20 sm:w-24">
      <rect x="8" y="10" width="80" height="52" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="m10 13 38 29 38-29M10 59l27-24M86 59 59 35" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function MysteryPickBoard({ cards }: { cards: MysteryCard[] }) {
  const t = useTranslations();
  const [chosen, setChosen] = useState<string | null>(null);

  return (
    <div className="grid gap-4 sm:grid-cols-3 sm:gap-5" aria-label="Mystery profile cards">
      {cards.map((card) => {
        const disabled = chosen !== null;
        return (
          <form key={card.token} action={resolveMysteryPick} onSubmit={() => setChosen(card.token)}>
            <input type="hidden" name="card_token" value={card.token} />
            <button
              type="submit"
              disabled={disabled}
              aria-label={`Mystery card ${card.position}`}
              className={`group relative flex min-h-64 w-full flex-col items-center justify-center overflow-hidden rounded-lg border border-[#d7d7cf] bg-[#fbfaf6] px-6 py-8 text-center transition hover:-translate-y-1 hover:border-[#087456]/60 hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#087456] motion-reduce:transform-none motion-reduce:transition-none disabled:cursor-wait disabled:opacity-70 sm:min-h-72`}
            >
              <span aria-hidden="true" className="absolute inset-x-5 top-4 border-t border-dashed border-[#c8cfc7]" />
              <span aria-hidden="true" className="absolute inset-x-5 bottom-4 border-t border-dashed border-[#c8cfc7]" />
              <span className="mb-3 rounded-full border border-[#087456]/25 bg-[#e8eee8] p-3 text-brand transition group-hover:bg-[#dfe9df]">
                <SealedLetter />
              </span>
              <span className="font-serif text-4xl leading-none text-primary">?</span>
              <span className="mt-4 text-xs font-semibold uppercase tracking-[.18em] text-brand">{t("app.mystery.sealed")}</span>
              {chosen === card.token && <span className="mt-2 text-xs text-black/50" role="status" aria-live="polite">{t("app.mystery.opening")}</span>}
            </button>
          </form>
        );
      })}
    </div>
  );
}

