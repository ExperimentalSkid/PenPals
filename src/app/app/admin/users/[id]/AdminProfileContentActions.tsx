"use client";

import { removeAdminProfileContent, restoreAdminProfileContent } from "../../actions";

type ContentType = "bio" | "quote" | "avatar";

function RemovalForm({ userId, contentType, label, note }: { userId: string; contentType: ContentType; label: string; note?: string }) {
  return <form
    action={removeAdminProfileContent}
    className="mt-3 border-l border-red-300/60 pl-4"
    onSubmit={(event) => {
      if (!window.confirm(`Remove this ${label.toLowerCase()} from the public profile? The original will be kept as private moderation evidence.`)) event.preventDefault();
    }}
  >
    <input type="hidden" name="target_user" value={userId} />
    <input type="hidden" name="content_type" value={contentType} />
    <label htmlFor={`moderation-reason-${contentType}`} className="text-xs text-black/55">Reason for removal (required)</label>
    <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
      <input
        id={`moderation-reason-${contentType}`}
        name="reason"
        required
        minLength={1}
        maxLength={500}
        className="field text-sm"
        placeholder="e.g. Reported harassment"
      />
      <button type="submit" className="btn-secondary shrink-0 border-red-300/70 px-3 py-2 text-sm text-red-800">{label}</button>
    </div>
    {note && <p className="mt-2 text-xs text-black/40">{note}</p>}
  </form>;
}

export default function AdminProfileContentActions({
  userId,
  bio,
  quote,
  hasPhoto,
  removedContent = [],
}: {
  userId: string;
  bio: string;
  quote: string;
  hasPhoto: boolean;
  removedContent?: Array<{ id: string; content_type: ContentType; previous_value: string | null; restored_at?: string | null }>;
}) {
  return <div className="mt-5 space-y-4">
    {bio.trim() && <RemovalForm userId={userId} contentType="bio" label="Remove bio" />}
    {quote.trim() && <RemovalForm userId={userId} contentType="quote" label="Remove quote" />}
    {hasPhoto && <RemovalForm userId={userId} contentType="avatar" label="Remove profile photo" note="The photo object is retained as private moderation evidence; clearing the profile pointer hides it immediately." />}
    {removedContent.filter((entry) => entry.previous_value && !entry.restored_at).map((entry) => <form key={`restore-${entry.id}`} action={restoreAdminProfileContent} className="border-l border-[#087456]/40 pl-4" onSubmit={(event) => { if (!window.confirm(`Restore this ${entry.content_type.replaceAll("_", " ")} exactly as preserved?`)) event.preventDefault(); }}><input type="hidden" name="evidence_id" value={entry.id}/><input type="hidden" name="target_user" value={userId}/><label htmlFor={`restore-reason-${entry.id}`} className="text-xs text-black/55">Restoration reason (required)</label><div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end"><input id={`restore-reason-${entry.id}`} name="reason" required minLength={1} maxLength={500} className="field text-sm" placeholder="e.g. Review found removal unnecessary"/><button type="submit" className="btn-secondary shrink-0 px-3 py-2 text-sm text-[#075d46]">Restore {entry.content_type.replaceAll("_", " ")}</button></div></form>)}
  </div>;
}
