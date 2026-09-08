"use client";

import { useTransition } from "react";
import { setAdminAccountStatus, setAdminUserRole } from "../../actions";

export default function AdminUserActions({ userId, role, deactivated }: { userId: string; role: string; deactivated: boolean }) {
  const [pending] = useTransition();
  return <div className="flex flex-wrap gap-3 border-t border-black/10 pt-6">
    <form action={setAdminAccountStatus} onSubmit={(event) => { if (!window.confirm(deactivated ? "Reactivate this account? This restores the user's access." : "Deactivate this account? The user will lose access until the account is reactivated.")) event.preventDefault(); }}>
      <input type="hidden" name="target_user" value={userId} />
      <input type="hidden" name="should_deactivate" value={String(!deactivated)} />
      <label htmlFor="admin-status-reason" className="sr-only">Moderation reason for account status change</label>
      <input id="admin-status-reason" name="reason" required minLength={1} maxLength={500} className="field mb-2 text-sm" placeholder="Explain this change (required)" />
      <label htmlFor="admin-status-confirm" className="mb-2 flex max-w-xs items-start gap-2 text-xs leading-5 text-black/60"><input id="admin-status-confirm" type="checkbox" name="confirm_status_change" value="yes" required disabled={pending} className="mt-0.5 h-4 w-4 shrink-0 accent-[#087456]" /><span>I understand this changes account access.</span></label>
      <button className="btn-secondary px-4 py-2.5 text-sm" disabled={pending}>{pending ? "Saving…" : deactivated ? "Reactivate account" : "Deactivate account"}</button>
    </form>
    <form action={setAdminUserRole} onSubmit={(event) => { if (!window.confirm("Change this account's role? This changes their access to staff tools.")) event.preventDefault(); }} className="flex items-center gap-2">
      <input type="hidden" name="target_user" value={userId} />
      <label htmlFor="admin-role" className="sr-only">Role</label>
      <select id="admin-role" name="new_role" defaultValue={role} className="field w-auto text-sm" disabled={pending}><option value="user">User</option><option value="moderator">Moderator</option><option value="admin">Admin</option></select>
      <label htmlFor="admin-role-reason" className="sr-only">Moderation reason for role change</label>
      <input id="admin-role-reason" name="reason" required minLength={1} maxLength={500} className="field w-40 text-sm" placeholder="Explain this change (required)" />
      <button className="btn-primary px-4 py-2.5 text-sm" disabled={pending}>{pending ? "Saving…" : "Save role"}</button>
    </form>
  </div>;
}
