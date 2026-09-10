"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function completeWelcome() {
  const db = await createClient();
  const { data: claims } = await db.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/sign-in");

  const { error } = await db.rpc("complete_my_onboarding_welcome");
  if (error) redirect("/app/welcome?error=1");

  revalidatePath("/app", "layout");
  redirect("/app/discover");
}
