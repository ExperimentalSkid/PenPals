"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "../guard";

export async function reviewAgeAppeal(formData: FormData) {
  const { db } = await requireAdmin();
  const appealId = String(formData.get("appeal_id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!appealId || !["approved", "rejected"].includes(decision) || reason.length < 1 || reason.length > 500) {
    redirect(`/app/admin/age-appeals?error=${encodeURIComponent("Choose an outcome and provide an admin reason (1–500 characters).")}`);
  }
  const { error } = await db.rpc("admin_review_age_appeal", { appeal_id: appealId, decision, decision_reason: reason });
  if (error) redirect(`/app/admin/age-appeals?error=${encodeURIComponent(error.message ?? "Age appeal could not be updated.")}`);
  redirect("/app/admin/age-appeals?updated=1");
}
