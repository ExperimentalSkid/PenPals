import type { ReactNode } from "react";

export type InterestRelation = { name?: string | null };
export type ProfileInterest = {
  interest_id: number;
  interests?: InterestRelation | InterestRelation[] | null;
};

function interestName(value: InterestRelation | InterestRelation[] | null | undefined) {
  const name = Array.isArray(value) ? value[0]?.name : value?.name;
  return name?.trim() || "Interest";
}

function InterestIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3 2.2 6.2L20 12l-5.8 2.8L12 21l-2.2-6.2L4 12l5.8-2.8L12 3Z" />
      <path d="m19 3 .5 1.5L21 5l-1.5.5L19 7l-.5-1.5L17 5l1.5-.5L19 3Z" />
    </svg>
  );
}

function Chips({ interests }: { interests: ProfileInterest[] }) {
  return <div className="flex flex-wrap gap-2">{interests.map((interest) => <span key={interest.interest_id} className="rounded-full border border-[#d7d0c3] bg-[#fbfaf6] px-3.5 py-1.5 text-sm text-[#33443e]">{interestName(interest.interests)}</span>)}</div>;
}

export default function InterestsSection({ interests }: { interests: ProfileInterest[] }): ReactNode {
  if (interests.length === 0) return null;

  const visibleInterests = interests.slice(0, 8);
  const additionalInterests = interests.slice(8);

  return (
    <section aria-labelledby="interests-heading" className="mt-9 border-t border-black/10 pt-7">
      <h2 id="interests-heading" className="flex items-center gap-3 font-sans text-[11px] font-semibold uppercase tracking-[.18em] text-[#3b5147]"><InterestIcon />Interests</h2>
      <div className="mt-5">
        <Chips interests={visibleInterests} />
        {additionalInterests.length > 0 && <details className="mt-3"><summary className="inline-flex cursor-pointer list-none rounded-full border border-[#d7d0c3] bg-[#fbfaf6] px-3.5 py-1.5 text-sm text-[#33443e] underline decoration-[#33443e]/35 underline-offset-2">+{additionalInterests.length} more</summary><div className="mt-3"><Chips interests={additionalInterests} /></div></details>}
      </div>
    </section>
  );
}
