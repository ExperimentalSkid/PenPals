"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function safeReturnPath(value: FormDataEntryValue | null) {
  const candidate = typeof value === "string" ? value : "";
  const fallback = "/app/discover";
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\")
    || [...candidate].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return fallback;
  try {
    const parsed = new URL(candidate, "https://penpal.invalid");
    if (parsed.origin !== "https://penpal.invalid" || parsed.pathname.startsWith("//")) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

function withReportState(path: string, key: "reported" | "error", value: string) {
  const parsed = new URL(path, "https://penpal.invalid");
  parsed.searchParams.set(key, value);
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export async function submitReport(formData: FormData) {
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  if (!data?.claims?.sub) redirect("/sign-in");
  const returnPath = safeReturnPath(formData.get("return_to"));
  const declinePending = formData.get("decline_pending") === "on";
  const { error } = await db.rpc("submit_report", {
    kind: String(formData.get("target_type")),
    target: String(formData.get("target_id")),
    report_reason: String(formData.get("reason")),
    report_details: String(formData.get("details") ?? ""),
    decline_pending: declinePending,
  });
  if (error) {
    const message = error.message?.includes("Please wait before submitting another report")
      ? "Please wait before submitting another report."
      : error.message;
    redirect(withReportState(returnPath, "error", message || "We couldn't submit that report."));
  }
  // Reports can create moderation cases; refresh staff counts as well as any
  // notification removed by the optional introduction decline.
  revalidatePath("/app", "layout");
  redirect(withReportState(returnPath, "reported", "1"));
}
