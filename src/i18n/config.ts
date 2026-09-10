export const supportedLocales = ["en", "es"] as const;

export type AppLocale = (typeof supportedLocales)[number];

export const defaultLocale: AppLocale = "en";
export const localeCookieName = "NEXT_LOCALE";

export function isSupportedLocale(value: string | undefined | null): value is AppLocale {
  return supportedLocales.includes(value as AppLocale);
}
