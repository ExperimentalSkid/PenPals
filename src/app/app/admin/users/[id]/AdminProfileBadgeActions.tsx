"use client";

import { useFormStatus } from "react-dom";
import ProfileBadge from "@/app/components/ProfileBadge";
import { PROFILE_BADGE_DEFINITIONS, MANUAL_PROFILE_BADGE_KEYS, isManualProfileBadgeKey, type ProfileBadgeKey } from "@/lib/profile-badges";
import { setAdminProfileBadge } from "../../actions";

const manualBadgeKeys = MANUAL_PROFILE_BADGE_KEYS;

type BadgeRecord = { badge_key?: unknown; is_derived?: unknown };

export default function AdminProfileBadgeActions({ userId, badges }: { userId: string; badges: BadgeRecord[] }) {
  const assigned = new Set(
    badges.flatMap((badge) => {
      const key = badge.badge_key;
      return typeof key === "string" && isManualProfileBadgeKey(key) && badge.is_derived !== true ? [key] : [];
    }),
  );
  const derived = Array.from(new Set(
    badges.flatMap((badge) => {
      const key = badge.badge_key;
      return badge.is_derived === true && typeof key === "string" && key in PROFILE_BADGE_DEFINITIONS ? [key as ProfileBadgeKey] : [];
    }),
  ));

  return <section aria-labelledby="profile-badges-heading" className="border-t border-black/10 pt-6">
    <h2 id="profile-badges-heading" className="section-title">Profile badges</h2>
    <p className="section-description mt-3">Assign or remove community badges here. Every change requires a reason and is recorded in the audit log.</p>
    <div className="mt-4 flex flex-wrap gap-2" aria-label="Current profile badges">
      {derived.map((key) => <ProfileBadge key={key} badge={key} />)}
      {manualBadgeKeys.filter((key) => assigned.has(key)).map((key) => <ProfileBadge key={key} badge={key} />)}
      {derived.length === 0 && manualBadgeKeys.every((key) => !assigned.has(key)) && <p className="text-sm text-black/45">No badges assigned.</p>}
    </div>
    <form action={setAdminProfileBadge} className="mt-5 space-y-3 rounded-lg border border-[#d9d3c8] bg-[#fffdfa] p-4">
      <input type="hidden" name="target_user" value={userId} />
      <BadgeFields assigned={assigned} />
    </form>
  </section>;
}

function BadgeFields({ assigned }: { assigned: Set<string> }) {
  const { pending } = useFormStatus();
  return <>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium text-primary">Badge
          <select name="badge_key" className="field mt-2 w-full text-sm" disabled={pending} defaultValue={manualBadgeKeys[0]}>
            {manualBadgeKeys.map((key) => <option key={key} value={key}>{PROFILE_BADGE_DEFINITIONS[key].label}{assigned.has(key) ? " · assigned" : ""}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-primary">Action
          <select name="action" className="field mt-2 w-full text-sm" disabled={pending} defaultValue="assign">
            <option value="assign">Assign</option>
            <option value="remove">Remove</option>
          </select>
        </label>
      </div>
      <label className="block text-sm font-medium text-primary">Reason <span className="text-xs font-normal text-black/45">(required)</span>
        <input name="reason" required minLength={1} maxLength={500} className="field mt-2 w-full text-sm" placeholder="Explain this badge change" disabled={pending} />
      </label>
      <button type="submit" className="btn-secondary px-4 py-2.5 text-sm" disabled={pending}>{pending ? "Saving…" : "Save badge change"}</button>
  </>;
}
