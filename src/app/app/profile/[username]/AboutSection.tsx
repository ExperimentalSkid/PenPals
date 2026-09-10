import type { ReactNode } from "react";

type AboutSectionProps = {
  bio?: string | null;
};

/**
 * The read-only biography module for a public profile.
 * Keeping this section independent makes it possible to reorder or expand it
 * later without coupling it to the other profile modules.
 */
export default function AboutSection({ bio }: AboutSectionProps): ReactNode {
  const text = typeof bio === "string" ? bio.trim() : "";
  if (!text) return null;

  return (
    <section aria-labelledby="about-heading" className="order-3 rounded-md border border-[#deded5] bg-[#fbfaf6] px-8 py-10 sm:px-11 sm:py-12 lg:order-none lg:col-span-2 lg:mt-5 xl:col-span-2 2xl:col-span-2">
      <h2 id="about-heading" className="font-serif text-[30px] tracking-[-0.025em] text-primary">About</h2>
      <div className="mt-3 h-px w-7 bg-[#2d735b]" />
      <div className="mt-6 max-w-[700px] space-y-5 text-[17px] leading-[1.8] text-black/75">
        {text.split(/\n\s*\n/).map((paragraph, index) => (
          <p key={index} className="whitespace-pre-line">{paragraph.trim()}</p>
        ))}
      </div>
    </section>
  );
}
