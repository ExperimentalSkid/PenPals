import type { ReactNode } from "react";
import { getPageI18n } from "@/i18n/server";

export type ProfilePersonality = {
  social_style?: string | null;
  daily_rhythm?: string | null;
  environment_preference?: string | null;
  travel_style?: string | null;
  pets?: string | null;
};

type LifestyleField = {
  key: keyof ProfilePersonality;
  label: string;
  values: Record<string, string>;
};

const fields: LifestyleField[] = [
  { key: "social_style", label: "Social style", values: { introvert: "Introvert", in_between: "Somewhere in between", extrovert: "Extrovert" } },
  { key: "daily_rhythm", label: "Daily rhythm", values: { early_bird: "Early bird", flexible: "Flexible", night_owl: "Night owl" } },
  { key: "environment_preference", label: "Environment", values: { city: "City", nature: "Nature", both: "City & nature" } },
  { key: "travel_style", label: "Travel style", values: { planner: "Planner", spontaneous: "Spontaneous", mix: "Mix of both" } },
  { key: "pets", label: "Pets", values: { has_pets: "Has pets", likes_animals: "Likes animals", no_preference: "No preference" } },
];

export default async function PersonalityLifestyleSection({ personality, heading }: { personality?: ProfilePersonality | null; heading: string }): Promise<ReactNode> {
  const { t } = await getPageI18n();
  const rows = fields.flatMap((field) => {
    const rawValue = personality?.[field.key];
    const value = typeof rawValue === "string" ? rawValue : undefined;
    if (!value) return [];
    const labelKey = { social_style: "socialStyle", daily_rhythm: "dailyRhythm", environment_preference: "environment", travel_style: "travelStyle", pets: "pets" }[field.key];
    const valueKey = { introvert: "introvert", in_between: "inBetween", extrovert: "extrovert", early_bird: "earlyBird", flexible: "flexible", night_owl: "nightOwl", city: "city", nature: "nature", both: "cityNature", planner: "planner", spontaneous: "spontaneous", mix: "mix", has_pets: "hasPets", likes_animals: "likesAnimals", no_preference: "noPreference" }[value];
    return valueKey ? [{ label: t(`app.profile.signals.${labelKey}`), value: t(`app.profile.signals.${valueKey}`) }] : [];
  });
  if (rows.length === 0) return null;

  return (
    <section aria-labelledby="personality-lifestyle-heading" className="order-4 rounded-md border border-[#deded5] bg-[#fbfaf6] px-8 py-8 sm:px-11 sm:py-9 lg:order-none lg:col-span-2 lg:mt-5 xl:col-span-2 2xl:col-span-2">
      <h2 id="personality-lifestyle-heading" className="font-sans text-[11px] font-semibold uppercase tracking-[.18em] text-primary">{heading}</h2>
      <dl className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2">
        {rows.map((row) => <div key={row.label} className="flex items-baseline justify-between gap-4 border-b border-black/[0.08] pb-3 text-[15px]"><dt className="text-black/50">{row.label}</dt><dd className="text-right text-black/75">{row.value}</dd></div>)}
      </dl>
    </section>
  );
}
