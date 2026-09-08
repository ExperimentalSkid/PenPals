"use client";

import { useFormStatus } from "react-dom";

export default function StaffSupportSubmitButton({ label, pendingLabel = "Saving…", primary = false }: { label: string; pendingLabel?: string; primary?: boolean }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className={`${primary ? "btn-primary" : "btn-secondary"} px-4 py-2.5 text-sm disabled:cursor-wait disabled:opacity-60`}>{pending ? pendingLabel : label}</button>;
}
