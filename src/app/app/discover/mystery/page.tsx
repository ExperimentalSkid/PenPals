import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import MysteryPickBoard from "./MysteryPickBoard";
import { getPageI18n } from "@/i18n/server";

type SearchValue = string | string[] | undefined;

function first(value: SearchValue) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function parseCards(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const cards = (value as { cards?: unknown }).cards;
  if (!Array.isArray(cards)) return [];
  return cards.flatMap((card, index) => {
    if (!card || typeof card !== "object" || Array.isArray(card)) return [];
    const token = (card as { token?: unknown }).token;
    const position = (card as { position?: unknown }).position;
    if (typeof token !== "string" || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(token)) return [];
    const parsedPosition = typeof position === "number" && Number.isInteger(position) ? position : index + 1;
    return [{ token, position: parsedPosition }];
  }).slice(0, 3);
}

export default async function MysteryPickPage({ searchParams }: { searchParams: Promise<Record<string, SearchValue>> }) {
  const { locale, t } = await getPageI18n();
  const db = await createClient();
  const { data, error } = await db.rpc("create_mystery_pick");
  const cards = error ? [] : parseCards(data);
  const message = first((await searchParams).error);

  return (
    <main lang={locale} className="mx-auto min-h-full w-full max-w-[1200px] bg-[#f7f5ef] px-6 py-12 text-primary sm:px-8 sm:py-14 lg:px-12 lg:py-16 xl:px-16">
      <Link href="/app/discover" className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-brand underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#087456]">
        <span aria-hidden="true">←</span> {t("app.mystery.back")}
      </Link>
      <p className="mt-12 text-[11px] font-bold uppercase tracking-[.24em] text-brand">{t("app.mystery.eyebrow")}</p>
      <h1 className="page-title-display mt-4 max-w-3xl">{t("app.mystery.title")}</h1>
      <p className="mt-5 max-w-xl text-lg leading-7 text-black/60 sm:text-xl">{t("app.mystery.intro")}</p>
      {message && <p role="alert" className="mt-8 border-l-2 border-[#087456]/50 bg-[#e8eee8]/60 px-4 py-3 text-sm text-brand">{message}</p>}
      {cards.length === 3 ? (
        <section className="mt-12" aria-labelledby="mystery-pick-prompt">
          <h2 id="mystery-pick-prompt" className="sr-only">{t("app.mystery.aria")}</h2>
          <MysteryPickBoard cards={cards} />
          <p className="mt-6 text-center text-sm text-black/50">{t("app.mystery.hidden")}</p>
        </section>
      ) : (
        <section className="mt-12 border-y border-black/10 py-14" aria-live="polite">
          <p className="section-title">{t("app.mystery.empty")}</p>
          <p className="mt-3 max-w-lg text-sm leading-6 text-black/55">{t("app.mystery.emptyBody")}</p>
          <Link href="/app/discover" className="btn-primary mt-6 inline-flex min-h-11 items-center rounded-md px-5 py-2.5 text-sm">{t("app.mystery.return")}</Link>
        </section>
      )}
    </main>
  );
}
