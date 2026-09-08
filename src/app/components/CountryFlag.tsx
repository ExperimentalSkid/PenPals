"use client";

/**
 * Render the canonical ISO alpha-2 country flag used throughout the app.
 * The shared country-flag-icons stylesheet contains the complete supported
 * flag set, so selectors and profile/location surfaces never fall back to
 * two-letter code boxes for less common countries.
 */
export default function CountryFlag({ code, countryName }: { code: string | null | undefined; countryName?: string | null }) {
  const normalized = typeof code === "string" ? code.trim().toUpperCase() : "";
  const isIsoAlpha2 = /^[A-Z]{2}$/.test(normalized);
  const label = countryName ? `${countryName} flag` : isIsoAlpha2 ? `${normalized} country flag` : "Country flag";

  return (
    <span
      role="img"
      aria-label={label}
      className="inline-flex h-4 w-5 shrink-0 items-center justify-center overflow-hidden rounded-[2px] border border-black/10 bg-[#f4f2ec] align-[-2px]"
      title={countryName ?? undefined}
    >
      {isIsoAlpha2 ? (
        <span
          className={`flag:${normalized}`}
          aria-hidden="true"
          style={{ display: "block", width: "100%", height: "100%" }}
        />
      ) : (
        <span aria-hidden="true" className="text-[13px] leading-none">🌐</span>
      )}
    </span>
  );
}
