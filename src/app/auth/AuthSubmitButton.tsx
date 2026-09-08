"use client";

import { useFormStatus } from "react-dom";

type AuthSubmitButtonProps = {
  idleLabel: string;
  pendingLabel: string;
};

/**
 * Keeps authentication submissions single-flight. Server actions navigate on
 * success or failure, so the pending state is intentionally owned by the
 * form boundary rather than duplicated in page state.
 */
export default function AuthSubmitButton({ idleLabel, pendingLabel }: AuthSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="btn-primary w-full justify-center disabled:cursor-wait disabled:opacity-60"
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}
