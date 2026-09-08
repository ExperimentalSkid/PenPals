"use client";

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
  const [goals, setGoals] = useState<string[]>(() => Array.isArray(initial.connection_goals) ? initial.connection_goals : []);
  const labelClass = "text-sm font-medium text-[#263b33]";
  const selectClass = "field mt-2 w-full rounded-md bg-[#fffdfa]";

  return (
    <div className="space-y-9">
      <fieldset>
        <legend className="font-serif text-xl text-[#10231d]">Personality &amp; lifestyle</legend>
        <p className="mt-2 text-sm leading-6 text-black/55">A few optional details help people get a feel for your everyday rhythm.</p>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          {personalityFields.map((field) => (
            <label key={field.name} className={labelClass}>
              {field.label}
              <select name={field.name} defaultValue={initial[field.name] ?? ""} className={selectClass}>
                <option value="">Select an option (optional)</option>
                {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="font-serif text-xl text-[#10231d]">Connection goals <span className="font-sans text-sm font-normal text-black/45">(optional)</span></legend>
        <p className="mt-2 text-sm leading-6 text-black/55">Choose the kinds of friendship and exchange you&apos;re open to.</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2" role="group" aria-label="Connection goals">
          {goalOptions.map((option) => {
            const checked = goals.includes(option.value);
            return <label key={option.value} className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 text-sm transition ${checked ? "border-[#087456]/45 bg-[#e8eee8] text-[#075d46]" : "border-black/10 bg-[#fffdfa] text-black/65 hover:border-[#087456]/40"}`}>
              <input type="checkbox" name="connection_goals" value={option.value} checked={checked} onChange={() => setGoals((current) => checked ? current.filter((value) => value !== option.value) : [...current, option.value])} className="h-4 w-4 accent-[#087456]" />
              <span>{option.label}</span>
            </label>;
          })}
        </div>
        <p className="mt-2 text-xs text-black/45">{goals.length} selected</p>
      </fieldset>

      <fieldset>
        <legend className="font-serif text-xl text-[#10231d]">Conversation preferences <span className="font-sans text-sm font-normal text-black/45">(optional)</span></legend>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <label className={labelClass}>Conversation style<select name="conversation_style" defaultValue={initial.conversation_style ?? ""} className={selectClass}><option value="">Select an option (optional)</option>{conversationStyles.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label className={labelClass}>Reply pace<select name="reply_pace" defaultValue={initial.reply_pace ?? ""} className={selectClass}><option value="">Select an option (optional)</option>{replyPaces.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        </div>
      </fieldset>
    </div>
  );
}
