import { getPageI18n } from "@/i18n/server";

export default async function ProfileNotFound() {
  const { locale, t } = await getPageI18n();
  return (
    <main lang={locale} className="flex min-h-[calc(100vh-73px)] w-full items-center justify-center bg-[#f7f5ef] px-6 text-primary">
      <p className="font-serif text-3xl">{t("app.profile.notFound")}</p>
    </main>
  );
}
