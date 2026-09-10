import { createTranslator, type AbstractIntlMessages } from "next-intl";
import { cookies, headers } from "next/headers";
import { defaultLocale, isSupportedLocale, localeCookieName, type AppLocale } from "./config";

export async function resolveLocale(): Promise<AppLocale> {
  const requestHeaders = await headers();
  const routeLocale = requestHeaders.get("x-penpals-locale");
  if (isSupportedLocale(routeLocale)) return routeLocale;
  const cookieStore = await cookies();
  const requestedLocale = cookieStore.get(localeCookieName)?.value;
  return isSupportedLocale(requestedLocale) ? requestedLocale : defaultLocale;
}

export async function loadMessages(locale: AppLocale): Promise<AbstractIntlMessages> {
  if (locale === "es") return (await import("./messages/es.json")).default;
  return (await import("./messages/en.json")).default;
}

export async function getLocaleI18n(locale: AppLocale) {
  const messages = await loadMessages(locale);
  const translator = createTranslator({ locale, messages });
  const t = (key: string, values?: Record<string, string | number>) => (translator as unknown as (key: string, values?: Record<string, string | number>) => string)(key, values);
  return { locale, messages, t };
}

export async function getPageI18n() {
  return getLocaleI18n(await resolveLocale());
}
