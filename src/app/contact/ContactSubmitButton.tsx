"use client";

import { useFormStatus } from "react-dom";

export default function ContactSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full justify-center disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto">
      {pending ? "Sending..." : "Send message"}
    </button>
  );
}
