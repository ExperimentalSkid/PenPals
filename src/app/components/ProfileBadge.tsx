import type { ReactNode } from "react";

import { PROFILE_BADGE_DEFINITIONS, type ProfileBadgeDefinition, type ProfileBadgeKey } from "@/lib/profile-badges";

const GRADED_BADGE_EXPLANATIONS: Record<string, Record<string, string>> = {
  "penpal-veteran": {
    bronze: "This user has been a member for at least 3 months.",
    silver: "This user has been a member for at least 6 months.",
    gold: "This user has been a member for at least 1 year.",
    platinum: "This user has been a member for at least 3 years.",
  },
  "profile-builder": {
    bronze: "This user has completed the minimum profile requirements.",
    silver: "This user has completed at least 75% of their profile.",
    gold: "This user has completed at least 90% of their profile.",
    platinum: "This user has completed 100% of their profile.",
  },
  "active-penpal": {
    bronze: "This user has recorded at least 30 active days.",
    silver: "This user has recorded at least 90 active days.",
    gold: "This user has recorded at least 365 active days.",
    platinum: "This user has recorded at least 730 active days.",
  },
  correspondent: {
    bronze: "This user has had at least 10 sent conversations accepted.",
    silver: "This user has had at least 30 sent conversations accepted.",
    gold: "This user has had at least 150 sent conversations accepted.",
    platinum: "This user has had at least 500 sent conversations accepted.",
  },
  connector: {
    bronze: "This user has connected with at least 25 different penpals.",
    silver: "This user has connected with at least 75 different penpals.",
    gold: "This user has connected with at least 150 different penpals.",
    platinum: "This user has connected with at least 300 different penpals.",
  },
  "snail-mailer": {
    bronze: "This user has sent at least 15 Snail Mail letters that were delivered or read.",
    silver: "This user has sent at least 30 Snail Mail letters that were delivered or read.",
    gold: "This user has sent at least 100 Snail Mail letters that were delivered or read.",
    platinum: "This user has sent at least 250 Snail Mail letters that were delivered or read.",
  },
  "reliable-replier": {
    bronze: "This user has a first-response rate of at least 70%.",
    silver: "This user has a first-response rate of at least 80%.",
    gold: "This user has a first-response rate of at least 90%.",
    platinum: "This user has a first-response rate of at least 95%.",
  },
  "early-member": {
    bronze: "This user joined Pen-Pals.net within the first 12 months after launch.",
    silver: "This user joined Pen-Pals.net within the first 6 months after launch.",
    gold: "This user joined Pen-Pals.net within the first 3 months after launch.",
    platinum: "This user joined Pen-Pals.net within the first 30 days after launch.",
  },
  "quick-replier": {
    bronze: "This user has an average first-response time of 72 hours or less.",
    silver: "This user has an average first-response time of 24 hours or less.",
    gold: "This user has an average first-response time of 8 hours or less.",
    platinum: "This user has an average first-response time of 2 hours or less.",
  },
  icebreaker: {
    bronze: "This user has sent at least 10 introductions.",
    silver: "This user has sent at least 50 introductions.",
    gold: "This user has sent at least 200 introductions.",
    platinum: "This user has sent at least 500 introductions.",
  },
  "conversation-starter": {
    bronze: "This user has started at least 10 conversations.",
    silver: "This user has started at least 50 conversations.",
    gold: "This user has started at least 200 conversations.",
    platinum: "This user has started at least 500 conversations.",
  },
  "letter-writer": {
    bronze: "This user has sent at least 100 messages.",
    silver: "This user has sent at least 500 messages.",
    gold: "This user has sent at least 2,500 messages.",
    platinum: "This user has sent at least 10,000 messages.",
  },
  "steady-penpal": {
    bronze: "This user has been active in at least 3 different months.",
    silver: "This user has been active in at least 6 different months.",
    gold: "This user has been active in at least 12 different months.",
    platinum: "This user has been active in at least 24 different months.",
  },
  "mystery-explorer": {
    bronze: "This user has made at least 10 Mystery Pick selections.",
    silver: "This user has made at least 50 Mystery Pick selections.",
    gold: "This user has made at least 200 Mystery Pick selections.",
    platinum: "This user has made at least 500 Mystery Pick selections.",
  },
  "across-borders": {
    bronze: "This user has sent Snail Mail to at least 5 different countries.",
    silver: "This user has sent Snail Mail to at least 15 different countries.",
    gold: "This user has sent Snail Mail to at least 30 different countries.",
    platinum: "This user has sent Snail Mail to at least 60 different countries.",
  },
  "regional-explorer": {
    bronze: "This user has sent Snail Mail to at least 10 different regions.",
    silver: "This user has sent Snail Mail to at least 30 different regions.",
    gold: "This user has sent Snail Mail to at least 75 different regions.",
    platinum: "This user has sent Snail Mail to at least 150 different regions.",
  },
  "mail-reader": {
    bronze: "This user has read at least 15 incoming Snail Mail letters.",
    silver: "This user has read at least 30 incoming Snail Mail letters.",
    gold: "This user has read at least 100 incoming Snail Mail letters.",
    platinum: "This user has read at least 250 incoming Snail Mail letters.",
  },
  multilingual: {
    bronze: "This user has declared at least 2 languages.",
    silver: "This user has declared at least 3 languages.",
    gold: "This user has declared at least 4 languages.",
    platinum: "This user has declared at least 5 languages.",
  },
  "language-learner": {
    bronze: "This user is learning at least 1 language.",
    silver: "This user is learning at least 2 languages.",
    gold: "This user is learning at least 3 languages.",
    platinum: "This user is learning at least 4 languages.",
  },
  "interest-explorer": {
    bronze: "This user has declared at least 5 interests.",
    silver: "This user has declared at least 10 interests.",
    gold: "This user has declared at least 20 interests.",
    platinum: "This user has declared at least 30 interests.",
  },
};

const NON_GRADED_BADGE_EXPLANATIONS: Record<string, string> = {
  verified: "This user has a currently valid verified profile status.",
  "early-member": "This user has been awarded the Early Member badge.",
  "helpful-penpal": "This user has been awarded the Helpful Penpal badge.",
  "community-contributor": "This user has been awarded the Community Contributor badge.",
  "language-exchange": "This user has been awarded the Language Exchange badge.",
  "local-guide": "This user has been awarded the Local Guide badge.",
  "event-host": "This user has been awarded the Event Host badge.",
  "kind-presence": "This user has been awarded the Kind Presence badge.",
};

const ICON_ONLY_BADGE_KEYS = new Set<ProfileBadgeKey>(["early-member"]);

function badgeExplanation(definition: ProfileBadgeDefinition) {
  const match = definition.key.match(/^(.*)-(bronze|silver|gold|platinum)$/);
  if (match) {
    const [, family, grade] = match;
    const explanation = GRADED_BADGE_EXPLANATIONS[family]?.[grade];
    if (explanation) return `${grade[0].toUpperCase()}${grade.slice(1)} — ${explanation}`;
  }
  return NON_GRADED_BADGE_EXPLANATIONS[definition.key] ?? `This user has been awarded the ${definition.label} badge.`;
}

function badgeAssetPath(definition: ProfileBadgeDefinition) {
  const assetName = ICON_ONLY_BADGE_KEYS.has(definition.key)
    ? `icons/${definition.key}`
    : `full/${definition.key}`;
  return `/badges/${assetName}.svg`;
}

export type ProfileBadgeProps = {
  badge: ProfileBadgeKey | ProfileBadgeDefinition;
  trailing?: ReactNode;
  className?: string;
  compact?: boolean;
};

export default function ProfileBadge({ badge, trailing, className = "", compact = false }: ProfileBadgeProps) {
  const definition = typeof badge === "string" ? PROFILE_BADGE_DEFINITIONS[badge] : badge;
  const explanation = badgeExplanation(definition);
  const assetPath = badgeAssetPath(definition);
  const fullAsset = !ICON_ONLY_BADGE_KEYS.has(definition.key);

  return (
    <span
      className={`group relative inline-flex max-w-full items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#0e5b85]/45 focus-visible:ring-offset-2 ${className}`}
      tabIndex={0}
      role={trailing ? undefined : "img"}
      aria-label={`${definition.label}. ${explanation}`}
      title={explanation}
    >
      {fullAsset ? (
        // These are local, pre-optimized SVG artwork exports from the supplied badge pack.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={assetPath} alt="" aria-hidden="true" className={`block w-auto max-w-full ${compact ? "h-9" : "h-12"}`} />
      ) : (
        <span className={`inline-flex max-w-full items-center rounded-full border border-[#AFCBE0] bg-[#F3F8FC] font-semibold text-[#103B61] ${compact ? "min-h-9 gap-1.5 px-2.5 py-1 text-[11px] leading-4" : "min-h-12 gap-2 px-3 py-1.5 text-xs leading-5"}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={assetPath} alt="" aria-hidden="true" className={`${compact ? "h-6 w-6" : "h-8 w-8"} shrink-0`} />
          <span className="min-w-0 whitespace-normal break-words">{definition.label}</span>
        </span>
      )}
      {!trailing && <span role="tooltip" className="pointer-events-none invisible absolute left-0 top-[calc(100%+8px)] z-30 w-full whitespace-normal break-words rounded-md border border-black/10 bg-[#fffdfa] px-3 py-2 text-left text-xs font-normal leading-5 text-[#263b33] opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100 group-focus:visible group-focus:opacity-100">{explanation}</span>}
      {trailing}
    </span>
  );
}
