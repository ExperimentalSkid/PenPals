"use client";

import { useEffect, useRef } from "react";

const setValue = (form: HTMLFormElement, name: string, value: string) => {
  const input = form.elements.namedItem(name);
  if (input instanceof HTMLInputElement) input.value = value;
};

export default function ContactClientMetadataFields() {
  const anchorRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const form = anchorRef.current?.closest("form");
    if (!(form instanceof HTMLFormElement)) return;

    const capture = () => {
      const now = new Date();
      const resolved = Intl.DateTimeFormat().resolvedOptions();
      setValue(form, "client_timezone", resolved.timeZone || "");
      setValue(form, "client_utc_offset_minutes", String(-now.getTimezoneOffset()));
      setValue(form, "client_timestamp_utc", now.toISOString());
      setValue(form, "client_epoch_ms", String(now.getTime()));
      setValue(form, "client_language", navigator.language || "");
      setValue(form, "client_languages", JSON.stringify(Array.from(navigator.languages || []).slice(0, 10)));
    };

    capture();
    form.addEventListener("submit", capture, { capture: true });
    return () => form.removeEventListener("submit", capture, { capture: true });
  }, []);

  return (
    <span ref={anchorRef} hidden aria-hidden="true">
      <input type="hidden" name="client_timezone" />
      <input type="hidden" name="client_utc_offset_minutes" />
      <input type="hidden" name="client_timestamp_utc" />
      <input type="hidden" name="client_epoch_ms" />
      <input type="hidden" name="client_language" />
      <input type="hidden" name="client_languages" />
    </span>
  );
}
