"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function submitAgeAppeal(formData: FormData) {
  const db = await createClient();
  const corrected = String(formData.get("corrected_birth_date") ?? "");
  const explanation = String(formData.get("explanation") ?? "").trim();
  const { data } = await db.auth.getClaims();
  if (!data?.claims?.sub) redirect(`/sign-in?error=${encodeURIComponent("Sign in to request a correction.")}`);
  const { error } = await db.rpc("submit_age_appeal", {
    corrected_birth_date: corrected || null,
    appeal_explanation: explanation || null,
  });
  if (error) redirect(`/age-appeal?error=${encodeURIComponent(error.message?.includes("18") ? "The corrected date must show you are at least 18." : "We couldn't submit that correction request.")}`);
  redirect("/age-appeal?submitted=1");
}
