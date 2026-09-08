import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import MysteryPickBoard from "./MysteryPickBoard";

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
  const db = await createClient();
  const { data, error } = await db.rpc("create_mystery_pick");
  const cards = error ? [] : parseCards(data);
  const message = first((await searchParams).error);

  return (
    <main className="mx-auto min-h-full w-full max-w-[1200px] bg-[#f7f5ef] px-6 py-12 text-[#16251f] sm:px-8 sm:py-14 lg:px-12 lg:py-16 xl:px-16">
      <Link href="/app/discover" className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-[#075d46] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#087456]">
        <span aria-hidden="true">←</span> Back to Discover
      </Link>
      <p className="mt-12 text-[11px] font-bold uppercase tracking-[.24em] text-[#087456]">Mystery Pick</p>
      <h1 className="mt-4 max-w-3xl font-serif text-[clamp(3rem,5vw,5rem)] leading-[0.96] tracking-[-0.045em] text-[#10231d]">Pick a penpal.</h1>
      <p className="mt-5 max-w-xl text-lg leading-7 text-black/60 sm:text-xl">Choose one of three sealed cards to meet someone new.</p>
      {message && <p role="alert" className="mt-8 border-l-2 border-[#087456]/50 bg-[#e8eee8]/60 px-4 py-3 text-sm text-[#075d46]">{message}</p>}
      {cards.length === 3 ? (
        <section className="mt-12" aria-labelledby="mystery-pick-prompt">
          <h2 id="mystery-pick-prompt" className="sr-only">Choose one mystery profile card</h2>
          <MysteryPickBoard cards={cards} />
          <p className="mt-6 text-center text-sm text-black/50">The other cards stay hidden.</p>
        </section>
      ) : (
        <section className="mt-12 border-y border-black/10 py-14" aria-live="polite">
          <p className="font-serif text-2xl text-[#10231d]">No cards are ready just yet.</p>
          <p className="mt-3 max-w-lg text-sm leading-6 text-black/55">We couldn&apos;t find three available people. Try Discover again later.</p>
          <Link href="/app/discover" className="btn-primary mt-6 inline-flex min-h-11 items-center rounded-md px-5 py-2.5 text-sm">Return to Discover</Link>
        </section>
      )}
    </main>
  );
}
