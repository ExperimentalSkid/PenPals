"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getPageI18n } from "@/i18n/server";

export async function submitAgeAppeal(formData: FormData) {
  const { t } = await getPageI18n();
  const db = await createClient();
  const corrected = String(formData.get("corrected_birth_date") ?? "");
  const explanation = String(formData.get("explanation") ?? "").trim();
  const { data } = await db.auth.getClaims();
  if (!data?.claims?.sub) redirect(`/sign-in?error=${encodeURIComponent(t("server.age.signIn"))}`);
  const { error } = await db.rpc("submit_age_appeal", {
    corrected_birth_date: corrected || null,
    appeal_explanation: explanation || null,
  });
  if (error) redirect(`/age-appeal?error=${encodeURIComponent(error.message?.includes("18") ? t("server.age.adult") : t("server.age.failed"))}`);
  redirect("/age-appeal?submitted=1");
}
