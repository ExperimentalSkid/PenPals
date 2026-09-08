"use client";

import { useFormStatus } from "react-dom";

export default function SubmitSupportReplyButton() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="btn-primary px-5 py-2.5 disabled:cursor-wait disabled:opacity-60">{pending ? "Sending…" : "Send reply to support"}</button>;
}
