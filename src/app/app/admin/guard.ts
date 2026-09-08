import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type StaffRole = "moderator" | "admin";

export async function requireStaff() {
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  const uid = data?.claims?.sub;
  if (!uid) redirect("/sign-in");

  const { data: profile } = await db.from("profiles").select("role,deactivated_at").eq("id", uid).maybeSingle();
  const role = profile?.role as StaffRole | "user" | undefined;
  if ((role !== "moderator" && role !== "admin") || profile?.deactivated_at) redirect("/app/discover");
  return { db, uid, role } as { db: Awaited<ReturnType<typeof createClient>>; uid: string; role: StaffRole };
}

export async function requireAdmin() {
  const staff = await requireStaff();
  if (staff.role !== "admin") redirect("/app/admin/reports");
  return staff;
}
