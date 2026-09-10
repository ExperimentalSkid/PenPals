"use client";

import { useTranslations } from "next-intl";

import { useState } from "react";

type PersonalityField = "social_style" | "daily_rhythm" | "environment_preference" | "travel_style" | "pets";

type ProfileSignalsProps = {
  initial?: Partial<Record<PersonalityField | "conversation_style" | "reply_pace", string | null>> & { connection_goals?: string[] | null };
};

const personalityFields: Array<{ name: PersonalityField; label: string; options: Array<{ value: string; label: string }> }> = [
  { name: "social_style", label: "Social style", options: [{ value: "introvert", label: "Introvert" }, { value: "in_between", label: "Somewhere in between" }, { value: "extrovert", label: "Extrovert" }] },
  { name: "daily_rhythm", label: "Daily rhythm", options: [{ value: "early_bird", label: "Early bird" }, { value: "flexible", label: "Flexible" }, { value: "night_owl", label: "Night owl" }] },
  { name: "environment_preference", label: "Environment", options: [{ value: "city", label: "City" }, { value: "nature", label: "Nature" }, { value: "both", label: "City and nature" }] },
  { name: "travel_style", label: "Travel style", options: [{ value: "planner", label: "Planner" }, { value: "spontaneous", label: "Spontaneous" }, { value: "mix", label: "A mix" }] },
  { name: "pets", label: "Pets", options: [{ value: "has_pets", label: "Has pets" }, { value: "likes_animals", label: "Likes animals" }, { value: "no_preference", label: "No preference" }] },
];

const goalOptions = [
  { value: "friendship", label: "Friendship" },
  { value: "long_term_friendship", label: "Long-term friendship" },
  { value: "casual_conversation", label: "Casual conversation" },
  { value: "cultural_exchange", label: "Cultural exchange" },
  { value: "language_exchange", label: "Language exchange" },
  { value: "pen_pal", label: "Pen pal / Snail Mail" },
  { value: "international_friendship", label: "Meeting people internationally" },
];

const conversationStyles = [
  { value: "short_casual_chats", label: "Short casual chats" },
  { value: "longer_conversations", label: "Longer conversations" },
  { value: "thoughtful_messages", label: "Thoughtful messages" },
  { value: "mix", label: "A mix" },
];

const replyPaces = [
  { value: "usually_quickly", label: "Usually replies quickly" },
  { value: "when_available", label: "Replies when available" },
  { value: "slow_replies_fine", label: "Slow replies are fine" },
  { value: "no_pressure", label: "No pressure" },
];

export default function ProfileSignals({ initial = {} }: ProfileSignalsProps) {
  const t = useTranslations();
  const [goals, setGoals] = useState<string[]>(() => Array.isArray(initial.connection_goals) ? initial.connection_goals : []);
  const personalityLabel = (value: string) => ({
    social_style: t("app.profile.signals.socialStyle"), introvert: t("app.profile.signals.introvert"), in_between: t("app.profile.signals.inBetween"), extrovert: t("app.profile.signals.extrovert"),
    daily_rhythm: t("app.profile.signals.dailyRhythm"), early_bird: t("app.profile.signals.earlyBird"), flexible: t("app.profile.signals.flexible"), night_owl: t("app.profile.signals.nightOwl"),
    environment_preference: t("app.profile.signals.environment"), city: t("app.profile.signals.city"), nature: t("app.profile.signals.nature"), both: t("app.profile.signals.cityNature"),
    travel_style: t("app.profile.signals.travelStyle"), planner: t("app.profile.signals.planner"), spontaneous: t("app.profile.signals.spontaneous"), mix: t("app.profile.signals.mix"),
    pets: t("app.profile.signals.pets"), has_pets: t("app.profile.signals.hasPets"), likes_animals: t("app.profile.signals.likesAnimals"), no_preference: t("app.profile.signals.noPreference")
  } as Record<string, string>)[value] ?? value;
  const optionLabel = (value: string) => ({
    friendship: t("app.profile.signals.friendship"), long_term_friendship: t("app.profile.signals.longTermFriendship"), casual_conversation: t("app.profile.signals.casualConversation"), cultural_exchange: t("app.profile.signals.culturalExchange"), language_exchange: t("app.profile.signals.languageExchange"), pen_pal: t("app.profile.signals.penPal"), international_friendship: t("app.profile.signals.internationalFriendship"),
    short_casual_chats: t("app.profile.signals.shortCasualChats"), longer_conversations: t("app.profile.signals.longerConversations"), thoughtful_messages: t("app.profile.signals.thoughtfulMessages"), mix: t("app.profile.signals.mix"), usually_quickly: t("app.profile.signals.usuallyQuickly"), when_available: t("app.profile.signals.whenAvailable"), slow_replies_fine: t("app.profile.signals.slowRepliesFine"), no_pressure: t("app.profile.signals.noPressure")
  } as Record<string, string>)[value] ?? value;

  const labelClass = "text-sm font-medium text-primary";
  const selectClass = "field mt-2 w-full rounded-md bg-[#fffdfa]";

  return (
    <div className="space-y-9">
      <fieldset>
        <legend className="subsection-title">{t("app.profile.personality")}</legend>
        <p className="section-description mt-2">{t("app.profile.personalityHelp")}</p>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          {personalityFields.map((field) => (
            <label key={field.name} className={labelClass}>
              {personalityLabel(field.name)}
              <select name={field.name} defaultValue={initial[field.name] ?? ""} className={selectClass}>
                <option value="">{t("app.profile.selectOptional")}</option>
                {field.options.map((option) => <option key={option.value} value={option.value}>{personalityLabel(option.value)}</option>)}
              </select>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="subsection-title">{t("app.profile.connectionGoals")} <span className="font-sans text-sm font-normal text-black/45">{t("app.profile.optionalWord")}</span></legend>
        <p className="section-description mt-2">{t("app.profile.connectionGoalsHelp")}</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2" role="group" aria-label={t("app.profile.connectionGoals")}>
          {goalOptions.map((option) => {
            const checked = goals.includes(option.value);
            return <label key={option.value} className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 text-sm transition ${checked ? "border-[#087456]/45 bg-[#e8eee8] text-brand" : "border-black/10 bg-[#fffdfa] text-black/65 hover:border-[#087456]/40"}`}>
              <input type="checkbox" name="connection_goals" value={option.value} checked={checked} onChange={() => setGoals((current) => checked ? current.filter((value) => value !== option.value) : [...current, option.value])} className="h-4 w-4 accent-[#087456]" />
              <span>{optionLabel(option.value)}</span>
            </label>;
          })}
        </div>
        <p className="mt-2 text-xs text-black/45">{t("app.profile.selectedCount", { count: goals.length })}</p>
      </fieldset>

      <fieldset>
        <legend className="subsection-title">{t("app.profile.conversationPreferences")} <span className="font-sans text-sm font-normal text-black/45">{t("app.profile.optionalWord")}</span></legend>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <label className={labelClass}>{t("app.profile.conversationStyle")}<select name="conversation_style" defaultValue={initial.conversation_style ?? ""} className={selectClass}><option value="">{t("app.profile.selectOptional")}</option>{conversationStyles.map((option) => <option key={option.value} value={option.value}>{personalityLabel(option.value)}</option>)}</select></label>
          <label className={labelClass}>{t("app.profile.replyPace")}<select name="reply_pace" defaultValue={initial.reply_pace ?? ""} className={selectClass}><option value="">{t("app.profile.selectOptional")}</option>{replyPaces.map((option) => <option key={option.value} value={option.value}>{personalityLabel(option.value)}</option>)}</select></label>
        </div>
      </fieldset>
    </div>
  );
}
