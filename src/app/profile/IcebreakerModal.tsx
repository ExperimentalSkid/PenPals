"use client";

import { useActionState, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useFormStatus } from "react-dom";

type IntroductionActionState = {
  status: "idle" | "error" | "quality";
  message?: string;
};

type IntroductionAction = (previousState: IntroductionActionState, formData: FormData) => Promise<IntroductionActionState> | IntroductionActionState;

const interestPromptTemplates: Record<string, string[]> = {
  books: [
    "Ask {name} about the last book they couldn't put down…",
    "What book would {name} recommend to someone new to reading?",
  ],
  music: [
    "Ask {name} what song they have had on repeat lately…",
    "What kind of music helps {name} feel at home?",
  ],
  movies: [
    "Ask {name} about a film they would happily watch again…",
    "What movie would {name} recommend for a cozy evening?",
  ],
  cooking: [
    "Ask {name} about the dish they most enjoy making…",
    "What food would {name} love to share with a new friend?",
  ],
  travel: [
    "Ask {name} about a place that left a lasting impression…",
    "Where would {name} love to go next, and why?",
  ],
  football: [
    "Ask {name} which team or match they never get tired of discussing…",
    "What makes football special to {name}?",
  ],
  sports: [
    "Ask {name} which sport they most enjoy following or playing…",
    "What sporting moment still makes {name} smile?",
  ],
  photography: [
    "Ask {name} what they most enjoy capturing with a camera…",
    "What kind of scene would {name} love to photograph next?",
  ],
  gaming: [
    "Ask {name} which game they would recommend for a great evening…",
    "What kind of games does {name} keep coming back to?",
  ],
  hiking: [
    "Ask {name} about a trail or outdoor place they love…",
    "What makes a day outside feel perfect to {name}?",
  ],
  languages: [
    "Ask {name} which language they most enjoy learning or practicing…",
    "What first sparked {name}'s interest in languages?",
  ],
};

function contextualPrompts(recipientName: string, interests: string[]) {
  const name = recipientName.trim() || "them";
  const normalizedInterests = interests
    .map((interest) => interest.trim())
    .filter(Boolean)
    .map((interest) => ({ label: interest, key: interest.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() }));
  const prompts = normalizedInterests.flatMap(({ label, key }) => {
    const templates = interestPromptTemplates[key] ?? [`Ask ${name} what they enjoy most about ${label.toLowerCase()}…`];
    return templates.map((template) => template.replaceAll("{name}", name));
  });
  return [...new Set([
    ...prompts,
    `Ask ${name} what they have been enjoying lately…`,
    `What first brought ${name} to pen-pals.net?`,
  ])];
}

function IcebreakerSubmitButton({ valid }: { valid: boolean }) {
  const { pending } = useFormStatus();
  const ready = valid && !pending;

  return (
    <button
      type="submit"
      disabled={pending || !valid}
      aria-disabled={pending || !valid}
      data-ready={ready ? "true" : "false"}
      className={`btn-primary transition-all duration-300 ease-out disabled:cursor-not-allowed ${ready ? "opacity-100 shadow-[0_6px_18px_rgba(8,116,86,0.16)]" : "opacity-40"}`}
    >
      {pending ? "Sending…" : "Send introduction"}
    </button>
  );
}

export default function IcebreakerModal({
  action,
  userId,
  username,
  recipientName,
  interestNames = [],
}: {
  action: IntroductionAction;
  userId: string;
  username: string;
  recipientName: string;
  interestNames?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [qualityGuidance, setQualityGuidance] = useState(false);
  const [state, formAction] = useActionState(action, { status: "idle" as const });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const wasOpen = useRef(false);
  const placeholders = useMemo(() => contextualPrompts(recipientName, interestNames), [recipientName, interestNames]);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const valid = text.length >= 50 && text.length <= 500 && wordCount >= 8;
  const placeholder = placeholders[placeholderIndex % placeholders.length] ?? `Ask ${recipientName.trim() || "them"} what they have been enjoying lately…`;

  useEffect(() => {
    if (!open || text.length > 0 || placeholders.length < 2) return;
    const interval = window.setInterval(() => {
      setPlaceholderIndex((current) => (current + 1) % placeholders.length);
    }, 4200);
    return () => window.clearInterval(interval);
  }, [open, placeholders, text.length]);

  useEffect(() => {
    if (state.status !== "quality") return;
    const frame = window.requestAnimationFrame(() => {
      setText("");
      setQualityGuidance(true);
      setOpen(true);
      window.requestAnimationFrame(() => composerRef.current?.focus());
    });
    return () => window.cancelAnimationFrame(frame);
  }, [state.status, state.message]);

  useEffect(() => {
    if (!open) {
      if (wasOpen.current) triggerRef.current?.focus();
      return;
    }
    wasOpen.current = true;
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), textarea, input, select, a[href]") ?? []);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => { setPlaceholderIndex(0); setOpen(true); }} className="btn-primary">
        Send introduction
      </button>
      {open && (
        <div ref={dialogRef} onKeyDown={handleDialogKeyDown} className="fixed inset-0 z-50 flex items-center justify-center bg-[#16251f]/35 p-5" role="dialog" aria-modal="true" aria-labelledby="icebreaker-title" aria-describedby="icebreaker-description">
          <div className="w-full max-w-lg border border-black/10 bg-[#fbfaf7] p-8">
            <button ref={closeRef} type="button" onClick={() => setOpen(false)} className="float-right text-xl leading-none text-black/45 hover:text-black/75" aria-label="Close">
              ×
            </button>
            <p className="eyebrow">A thoughtful hello</p>
            <h2 id="icebreaker-title" className="mt-2 font-serif text-3xl text-[#10231d]">Introduce yourself</h2>
            <p id="icebreaker-description" className="mt-3 max-w-md text-sm leading-6 text-black/60">Introductions are a short first note to help someone decide whether to start a conversation.</p>
            <form action={formAction} className="mt-6 space-y-4">
              <input type="hidden" name="user_id" value={userId} />
              <input type="hidden" name="username" value={username} />
              <div>
                {qualityGuidance && <p id="icebreaker-quality-guidance" role="status" className="mb-3 border-l-2 border-[#087456]/40 pl-3 text-sm leading-6 text-[#263b33]">Write a genuine introduction. Mention something from their profile, something you have in common, or ask a real question. Repeated characters and filler text won’t be accepted.</p>}
                <textarea
                  id="icebreaker-text"
                  ref={composerRef}
                  name="introduction"
                  required
                  minLength={50}
                  maxLength={500}
                  value={text}
                  onChange={(event) => { const nextText = event.target.value; setText(nextText); if (nextText.length > 0) setQualityGuidance(false); }}
                  aria-describedby={`icebreaker-guidance icebreaker-count${qualityGuidance ? " icebreaker-quality-guidance" : ""}`}
                  className="field min-h-48 w-full resize-y leading-7"
                  placeholder={placeholder}
                />
                <label htmlFor="icebreaker-text" className="sr-only">Introduction message</label>
                <div id="icebreaker-guidance" className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-black/50">
                  <span>50–500 characters</span>
                  <span>At least 8 words</span>
                </div>
                <p id="icebreaker-count" className={`mt-1 text-xs ${valid ? "text-[#087456]" : "text-black/45"}`}>
                  {text.length}/500 · {wordCount} words
                </p>
                {state.status === "error" && state.message && <p role="alert" className="mt-2 text-sm leading-6 text-red-700">{state.message}</p>}
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="rounded-md px-4 py-2.5 text-sm text-black/60 hover:bg-black/[0.04]">
                  Cancel
                </button>
                <IcebreakerSubmitButton valid={valid} />
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
