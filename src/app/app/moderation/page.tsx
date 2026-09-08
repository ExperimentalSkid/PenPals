import { redirect } from "next/navigation";

export default function ModerationRedirect() {
  redirect("/app/admin/reports");
}
