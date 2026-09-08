"use client";

export default function AgeAppealDecision({
  appealId,
  action,
}: {
  appealId: string;
  action: (formData: FormData) => Promise<void>;
}) {
  return <form action={action} className="mt-6 border-t border-black/10 pt-5"><input type="hidden" name="appeal_id" value={appealId} /><label className="block max-w-xl text-sm text-black/60">Reason for this decision (required)<input name="reason" required minLength={1} maxLength={500} className="field mt-2 w-full" placeholder="Reason for this decision" /></label><div className="mt-4 flex flex-wrap gap-3"><button name="decision" value="approved" className="btn-primary px-4 py-2.5 text-sm" onClick={(event) => { if (!window.confirm("Approve this age correction? The restricted account will be cleared so they can retry signup.")) event.preventDefault(); }}>Approve correction</button><button name="decision" value="rejected" className="btn-secondary px-4 py-2.5 text-sm" onClick={(event) => { if (!window.confirm("Reject this age correction? The account will stay restricted.")) event.preventDefault(); }}>Reject correction</button></div></form>;
}
