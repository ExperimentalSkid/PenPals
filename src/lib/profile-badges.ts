export type ProfileBadgeKey =
  | "verified"
  | "early-member"
  | "helpful-penpal"
  | "community-contributor"
  | "language-exchange"
  | "local-guide"
  | "event-host"
  | "kind-presence"
  | "penpal-veteran-bronze"
  | "penpal-veteran-silver"
  | "penpal-veteran-gold"
  | "penpal-veteran-platinum"
  | "profile-builder-bronze"
  | "profile-builder-silver"
  | "profile-builder-gold"
  | "profile-builder-platinum"
  | "active-penpal-bronze"
  | "active-penpal-silver"
  | "active-penpal-gold"
  | "active-penpal-platinum"
  | "correspondent-bronze"
  | "correspondent-silver"
  | "correspondent-gold"
  | "correspondent-platinum"
  | "connector-bronze"
  | "connector-silver"
  | "connector-gold"
  | "connector-platinum"
  | "snail-mailer-bronze"
  | "snail-mailer-silver"
  | "snail-mailer-gold"
  | "snail-mailer-platinum"
  | "reliable-replier-bronze"
  | "reliable-replier-silver"
  | "reliable-replier-gold"
  | "reliable-replier-platinum"
  | "early-member-bronze"
  | "early-member-silver"
  | "early-member-gold"
  | "early-member-platinum"
  | "quick-replier-bronze"
  | "quick-replier-silver"
  | "quick-replier-gold"
  | "quick-replier-platinum"
  | "icebreaker-bronze"
  | "icebreaker-silver"
  | "icebreaker-gold"
  | "icebreaker-platinum"
  | "conversation-starter-bronze"
  | "conversation-starter-silver"
  | "conversation-starter-gold"
  | "conversation-starter-platinum"
  | "letter-writer-bronze"
  | "letter-writer-silver"
  | "letter-writer-gold"
  | "letter-writer-platinum"
  | "steady-penpal-bronze"
  | "steady-penpal-silver"
  | "steady-penpal-gold"
  | "steady-penpal-platinum"
  | "mystery-explorer-bronze"
  | "mystery-explorer-silver"
  | "mystery-explorer-gold"
  | "mystery-explorer-platinum"
  | "across-borders-bronze"
  | "across-borders-silver"
  | "across-borders-gold"
  | "across-borders-platinum"
  | "regional-explorer-bronze"
  | "regional-explorer-silver"
  | "regional-explorer-gold"
  | "regional-explorer-platinum"
  | "mail-reader-bronze"
  | "mail-reader-silver"
  | "mail-reader-gold"
  | "mail-reader-platinum"
  | "multilingual-bronze"
  | "multilingual-silver"
  | "multilingual-gold"
  | "multilingual-platinum"
  | "language-learner-bronze"
  | "language-learner-silver"
  | "language-learner-gold"
  | "language-learner-platinum"
  | "interest-explorer-bronze"
  | "interest-explorer-silver"
  | "interest-explorer-gold"
  | "interest-explorer-platinum";

export type ProfileBadgeIcon = "check" | "star" | "people" | "leaf" | "globe" | "pin" | "calendar" | "heart";
type BadgeTone =
  | "verified"
  | "early-member"
  | "helpful-penpal"
  | "community-contributor"
  | "language-exchange"
  | "local-guide"
  | "event-host"
  | "kind-presence"
  | "penpal-veteran"
  | "profile-builder"
  | "active-penpal"
  | "correspondent"
  | "connector"
  | "snail-mailer"
  | "reliable-replier"
  | "quick-replier"
  | "icebreaker"
  | "conversation-starter"
  | "letter-writer"
  | "steady-penpal"
  | "mystery-explorer"
  | "across-borders"
  | "regional-explorer";

export type ProfileBadgeDefinition = {
  key: ProfileBadgeKey;
  label: string;
  icon: ProfileBadgeIcon;
  tone: BadgeTone;
};

/**
 * The supported badge vocabulary lives in one place so labels and visual
 * treatment stay consistent wherever badges are eventually displayed.
 */
export const PROFILE_BADGE_DEFINITIONS: Record<ProfileBadgeKey, ProfileBadgeDefinition> = {
  verified: { key: "verified", label: "Verified", icon: "check", tone: "verified" },
  "early-member": { key: "early-member", label: "Early Member", icon: "star", tone: "early-member" },
  "helpful-penpal": { key: "helpful-penpal", label: "Helpful Penpal", icon: "people", tone: "helpful-penpal" },
  "community-contributor": { key: "community-contributor", label: "Community Contributor", icon: "leaf", tone: "community-contributor" },
  "language-exchange": { key: "language-exchange", label: "Language Exchange", icon: "globe", tone: "language-exchange" },
  "local-guide": { key: "local-guide", label: "Local Guide", icon: "pin", tone: "local-guide" },
  "event-host": { key: "event-host", label: "Event Host", icon: "calendar", tone: "event-host" },
  "kind-presence": { key: "kind-presence", label: "Kind Presence", icon: "heart", tone: "kind-presence" },
  "penpal-veteran-bronze": { key: "penpal-veteran-bronze", label: "Penpal Veteran · Bronze", icon: "star", tone: "penpal-veteran" },
  "penpal-veteran-silver": { key: "penpal-veteran-silver", label: "Penpal Veteran · Silver", icon: "star", tone: "penpal-veteran" },
  "penpal-veteran-gold": { key: "penpal-veteran-gold", label: "Penpal Veteran · Gold", icon: "star", tone: "penpal-veteran" },
  "penpal-veteran-platinum": { key: "penpal-veteran-platinum", label: "Penpal Veteran · Platinum", icon: "star", tone: "penpal-veteran" },
  "profile-builder-bronze": { key: "profile-builder-bronze", label: "Profile Builder · Bronze", icon: "star", tone: "profile-builder" },
  "profile-builder-silver": { key: "profile-builder-silver", label: "Profile Builder · Silver", icon: "star", tone: "profile-builder" },
  "profile-builder-gold": { key: "profile-builder-gold", label: "Profile Builder · Gold", icon: "star", tone: "profile-builder" },
  "profile-builder-platinum": { key: "profile-builder-platinum", label: "Profile Builder · Platinum", icon: "star", tone: "profile-builder" },
  "active-penpal-bronze": { key: "active-penpal-bronze", label: "Active Penpal · Bronze", icon: "calendar", tone: "active-penpal" },
  "active-penpal-silver": { key: "active-penpal-silver", label: "Active Penpal · Silver", icon: "calendar", tone: "active-penpal" },
  "active-penpal-gold": { key: "active-penpal-gold", label: "Active Penpal · Gold", icon: "calendar", tone: "active-penpal" },
  "active-penpal-platinum": { key: "active-penpal-platinum", label: "Active Penpal · Platinum", icon: "calendar", tone: "active-penpal" },
  "correspondent-bronze": { key: "correspondent-bronze", label: "Correspondent · Bronze", icon: "people", tone: "correspondent" },
  "correspondent-silver": { key: "correspondent-silver", label: "Correspondent · Silver", icon: "people", tone: "correspondent" },
  "correspondent-gold": { key: "correspondent-gold", label: "Correspondent · Gold", icon: "people", tone: "correspondent" },
  "correspondent-platinum": { key: "correspondent-platinum", label: "Correspondent · Platinum", icon: "people", tone: "correspondent" },
  "connector-bronze": { key: "connector-bronze", label: "Connector · Bronze", icon: "people", tone: "connector" },
  "connector-silver": { key: "connector-silver", label: "Connector · Silver", icon: "people", tone: "connector" },
  "connector-gold": { key: "connector-gold", label: "Connector · Gold", icon: "people", tone: "connector" },
  "connector-platinum": { key: "connector-platinum", label: "Connector · Platinum", icon: "people", tone: "connector" },
  "snail-mailer-bronze": { key: "snail-mailer-bronze", label: "Snail Mailer · Bronze", icon: "heart", tone: "snail-mailer" },
  "snail-mailer-silver": { key: "snail-mailer-silver", label: "Snail Mailer · Silver", icon: "heart", tone: "snail-mailer" },
  "snail-mailer-gold": { key: "snail-mailer-gold", label: "Snail Mailer · Gold", icon: "heart", tone: "snail-mailer" },
  "snail-mailer-platinum": { key: "snail-mailer-platinum", label: "Snail Mailer · Platinum", icon: "heart", tone: "snail-mailer" },
  "reliable-replier-bronze": { key: "reliable-replier-bronze", label: "Reliable Replier · Bronze", icon: "people", tone: "reliable-replier" },
  "reliable-replier-silver": { key: "reliable-replier-silver", label: "Reliable Replier · Silver", icon: "people", tone: "reliable-replier" },
  "reliable-replier-gold": { key: "reliable-replier-gold", label: "Reliable Replier · Gold", icon: "people", tone: "reliable-replier" },
  "reliable-replier-platinum": { key: "reliable-replier-platinum", label: "Reliable Replier · Platinum", icon: "people", tone: "reliable-replier" },
  "early-member-bronze": { key: "early-member-bronze", label: "Early Member · Bronze", icon: "star", tone: "early-member" },
  "early-member-silver": { key: "early-member-silver", label: "Early Member · Silver", icon: "star", tone: "early-member" },
  "early-member-gold": { key: "early-member-gold", label: "Early Member · Gold", icon: "star", tone: "early-member" },
  "early-member-platinum": { key: "early-member-platinum", label: "Early Member · Platinum", icon: "star", tone: "early-member" },
  "quick-replier-bronze": { key: "quick-replier-bronze", label: "Quick Replier · Bronze", icon: "people", tone: "quick-replier" },
  "quick-replier-silver": { key: "quick-replier-silver", label: "Quick Replier · Silver", icon: "people", tone: "quick-replier" },
  "quick-replier-gold": { key: "quick-replier-gold", label: "Quick Replier · Gold", icon: "people", tone: "quick-replier" },
  "quick-replier-platinum": { key: "quick-replier-platinum", label: "Quick Replier · Platinum", icon: "people", tone: "quick-replier" },
  "icebreaker-bronze": { key: "icebreaker-bronze", label: "Icebreaker · Bronze", icon: "people", tone: "icebreaker" },
  "icebreaker-silver": { key: "icebreaker-silver", label: "Icebreaker · Silver", icon: "people", tone: "icebreaker" },
  "icebreaker-gold": { key: "icebreaker-gold", label: "Icebreaker · Gold", icon: "people", tone: "icebreaker" },
  "icebreaker-platinum": { key: "icebreaker-platinum", label: "Icebreaker · Platinum", icon: "people", tone: "icebreaker" },
  "conversation-starter-bronze": { key: "conversation-starter-bronze", label: "Conversation Starter · Bronze", icon: "people", tone: "conversation-starter" },
  "conversation-starter-silver": { key: "conversation-starter-silver", label: "Conversation Starter · Silver", icon: "people", tone: "conversation-starter" },
  "conversation-starter-gold": { key: "conversation-starter-gold", label: "Conversation Starter · Gold", icon: "people", tone: "conversation-starter" },
  "conversation-starter-platinum": { key: "conversation-starter-platinum", label: "Conversation Starter · Platinum", icon: "people", tone: "conversation-starter" },
  "letter-writer-bronze": { key: "letter-writer-bronze", label: "Letter Writer · Bronze", icon: "people", tone: "letter-writer" },
  "letter-writer-silver": { key: "letter-writer-silver", label: "Letter Writer · Silver", icon: "people", tone: "letter-writer" },
  "letter-writer-gold": { key: "letter-writer-gold", label: "Letter Writer · Gold", icon: "people", tone: "letter-writer" },
  "letter-writer-platinum": { key: "letter-writer-platinum", label: "Letter Writer · Platinum", icon: "people", tone: "letter-writer" },
  "steady-penpal-bronze": { key: "steady-penpal-bronze", label: "Steady Penpal · Bronze", icon: "calendar", tone: "steady-penpal" },
  "steady-penpal-silver": { key: "steady-penpal-silver", label: "Steady Penpal · Silver", icon: "calendar", tone: "steady-penpal" },
  "steady-penpal-gold": { key: "steady-penpal-gold", label: "Steady Penpal · Gold", icon: "calendar", tone: "steady-penpal" },
  "steady-penpal-platinum": { key: "steady-penpal-platinum", label: "Steady Penpal · Platinum", icon: "calendar", tone: "steady-penpal" },
  "mystery-explorer-bronze": { key: "mystery-explorer-bronze", label: "Mystery Explorer · Bronze", icon: "globe", tone: "mystery-explorer" },
  "mystery-explorer-silver": { key: "mystery-explorer-silver", label: "Mystery Explorer · Silver", icon: "globe", tone: "mystery-explorer" },
  "mystery-explorer-gold": { key: "mystery-explorer-gold", label: "Mystery Explorer · Gold", icon: "globe", tone: "mystery-explorer" },
  "mystery-explorer-platinum": { key: "mystery-explorer-platinum", label: "Mystery Explorer · Platinum", icon: "globe", tone: "mystery-explorer" },
  "across-borders-bronze": { key: "across-borders-bronze", label: "Across Borders · Bronze", icon: "globe", tone: "across-borders" },
  "across-borders-silver": { key: "across-borders-silver", label: "Across Borders · Silver", icon: "globe", tone: "across-borders" },
  "across-borders-gold": { key: "across-borders-gold", label: "Across Borders · Gold", icon: "globe", tone: "across-borders" },
  "across-borders-platinum": { key: "across-borders-platinum", label: "Across Borders · Platinum", icon: "globe", tone: "across-borders" },
  "regional-explorer-bronze": { key: "regional-explorer-bronze", label: "Regional Explorer · Bronze", icon: "pin", tone: "regional-explorer" },
  "regional-explorer-silver": { key: "regional-explorer-silver", label: "Regional Explorer · Silver", icon: "pin", tone: "regional-explorer" },
  "regional-explorer-gold": { key: "regional-explorer-gold", label: "Regional Explorer · Gold", icon: "pin", tone: "regional-explorer" },
  "regional-explorer-platinum": { key: "regional-explorer-platinum", label: "Regional Explorer · Platinum", icon: "pin", tone: "regional-explorer" },
  "mail-reader-bronze": { key: "mail-reader-bronze", label: "Mail Reader · Bronze", icon: "heart", tone: "snail-mailer" },
  "mail-reader-silver": { key: "mail-reader-silver", label: "Mail Reader · Silver", icon: "heart", tone: "snail-mailer" },
  "mail-reader-gold": { key: "mail-reader-gold", label: "Mail Reader · Gold", icon: "heart", tone: "snail-mailer" },
  "mail-reader-platinum": { key: "mail-reader-platinum", label: "Mail Reader · Platinum", icon: "heart", tone: "snail-mailer" },
  "multilingual-bronze": { key: "multilingual-bronze", label: "Multilingual · Bronze", icon: "globe", tone: "language-exchange" },
  "multilingual-silver": { key: "multilingual-silver", label: "Multilingual · Silver", icon: "globe", tone: "language-exchange" },
  "multilingual-gold": { key: "multilingual-gold", label: "Multilingual · Gold", icon: "globe", tone: "language-exchange" },
  "multilingual-platinum": { key: "multilingual-platinum", label: "Multilingual · Platinum", icon: "globe", tone: "language-exchange" },
  "language-learner-bronze": { key: "language-learner-bronze", label: "Language Learner · Bronze", icon: "globe", tone: "language-exchange" },
  "language-learner-silver": { key: "language-learner-silver", label: "Language Learner · Silver", icon: "globe", tone: "language-exchange" },
  "language-learner-gold": { key: "language-learner-gold", label: "Language Learner · Gold", icon: "globe", tone: "language-exchange" },
  "language-learner-platinum": { key: "language-learner-platinum", label: "Language Learner · Platinum", icon: "globe", tone: "language-exchange" },
  "interest-explorer-bronze": { key: "interest-explorer-bronze", label: "Interest Explorer · Bronze", icon: "globe", tone: "language-exchange" },
  "interest-explorer-silver": { key: "interest-explorer-silver", label: "Interest Explorer · Silver", icon: "globe", tone: "language-exchange" },
  "interest-explorer-gold": { key: "interest-explorer-gold", label: "Interest Explorer · Gold", icon: "globe", tone: "language-exchange" },
  "interest-explorer-platinum": { key: "interest-explorer-platinum", label: "Interest Explorer · Platinum", icon: "globe", tone: "language-exchange" },
};

/** The same manual vocabulary drives the staff form and server action. */
export const MANUAL_PROFILE_BADGE_KEYS = [
  "early-member",
  "helpful-penpal",
  "community-contributor",
  "language-exchange",
  "local-guide",
  "event-host",
  "kind-presence",
] as const satisfies readonly ProfileBadgeKey[];

export type ManualProfileBadgeKey = (typeof MANUAL_PROFILE_BADGE_KEYS)[number];

export function isManualProfileBadgeKey(value: string): value is ManualProfileBadgeKey {
  return MANUAL_PROFILE_BADGE_KEYS.some((key) => key === value);
}
