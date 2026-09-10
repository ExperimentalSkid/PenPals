import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { unblockUser } from "@/app/app/profile/actions";
import { getPageI18n } from "@/i18n/server";

export default async function Blocked() {
  const { locale, t } = await getPageI18n();
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  if (!data?.claims?.sub) redirect("/sign-in");

  const { data: rows, error: blockedError } = await db
    .from("profile_blocks")
    .select("blocked_id,profiles(username,display_name)")
    .eq("blocker_id", data.claims.sub);

  return (
    <main lang={locale} className="min-h-screen w-full bg-[#f7f5ef] px-6 py-10 text-primary lg:px-16 lg:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <Link href="/app/settings" className="text-sm font-medium text-brand hover:underline">← {t("app.settings.backSettings")}</Link>
        <p className="eyebrow mt-12">{t("app.settings.privacy")}</p>
        <h1 className="page-title">{t("app.settings.blockedUsers")}</h1>
        <p className="mt-3 text-lg text-black/60">{t("app.settings.blockedIntro")}</p>
        <div className="mt-10 divide-y divide-black/10 border-t border-black/10">
          {(!blockedError ? rows ?? [] : []).map((row) => {
            const profile = Array.isArray(row.profiles) ? row.profiles[0] ?? null : row.profiles;
            return (
              <div key={row.blocked_id} className="flex items-center justify-between gap-4 py-5">
                <div>
                  <p className="font-medium text-primary">{profile?.display_name || t("app.settings.blockedProfile")}</p>
                  {profile?.username && <p className="mt-1 text-sm text-black/50">@{profile.username}</p>}
                </div>
                <form action={unblockUser}>
                  <input type="hidden" name="blocked_id" value={row.blocked_id} />
                  <button className="rounded-md border border-black/15 px-3 py-2 text-sm text-black/65 hover:bg-white/50">{t("app.settings.unblock")}</button>
                </form>
              </div>
            );
          })}
          {blockedError && <p role="alert" className="notice notice-error py-4">{t("app.settings.blockedLoadError")}</p>}
          {!blockedError && !rows?.length && <p className="py-10 text-sm text-black/50">{t("app.settings.noneBlocked")}</p>}
        </div>
      </div>
    </main>
  );
}
