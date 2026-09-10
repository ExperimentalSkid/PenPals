"use client";

import { usePathname, useSearchParams } from "next/navigation";
import type { AppLocale } from "@/i18n/config";
import CountryFlag from "@/app/components/CountryFlag";

function localizedPath(pathname: string, locale: AppLocale) {
  const englishPath = pathname === "/es" ? "/" : pathname.startsWith("/es/") ? pathname.slice(3) : pathname;
  const publicPath = englishPath === "/" || ["/faq", "/privacy", "/terms", "/guidelines", "/contact"].includes(englishPath) || ["/country/", "/language/", "/interest/"].some((prefix) => englishPath.startsWith(prefix));
  if (!publicPath) return null;
  return locale === "es" ? (englishPath === "/" ? "/es" : `/es${englishPath}`) : englishPath;
}

export default function LanguageSwitcher({ locale, label, paths }: { locale: AppLocale; label: string; paths?: Partial<Record<AppLocale, string>> }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function selectLocale(nextLocale: AppLocale) {
    if (nextLocale === locale) { window.location.reload(); return; }
    document.cookie = `NEXT_LOCALE=${nextLocale}; Path=/; Max-Age=31536000; SameSite=Lax`;
    const targetPath = paths?.[nextLocale] ?? localizedPath(pathname, nextLocale);
    const query = searchParams.toString();
    if (!targetPath) {
      window.location.reload();
      return;
    }
    const target = query && !targetPath.includes("?") ? `${targetPath}?${query}` : targetPath;
    window.location.assign(target);
  }

  return (
    <div role="group" aria-label={label} className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => selectLocale("en")}
        aria-label="English"
        aria-pressed={locale === "en"}
        title="English"
        className={`flex h-8 w-10 items-center justify-center rounded-md border transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#073A73]/35 ${locale === "en" ? "border-[#073A73] bg-white shadow-sm" : "border-[#D9D3C8] bg-white/55"}`}
      >
        <CountryFlag code="GB" countryName="United Kingdom" />
      </button>
      <button
        type="button"
        onClick={() => selectLocale("es")}
        aria-label="Español"
        aria-pressed={locale === "es"}
        title="Español"
        className={`flex h-8 w-10 items-center justify-center rounded-md border transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#073A73]/35 ${locale === "es" ? "border-[#073A73] bg-white shadow-sm" : "border-[#D9D3C8] bg-white/55"}`}
      >
        <CountryFlag code="ES" countryName="Spain" />
      </button>
    </div>
  );
}
