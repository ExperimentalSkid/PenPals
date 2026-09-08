import { reactivateAccount } from "@/app/app/profile/actions";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ReactivatePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const db = await createClient();
  const { data: claimsData } = await db.auth.getClaims();
  const uid = claimsData?.claims?.sub;
  if (!uid) redirect("/sign-in");

  const { data: userData } = await db.auth.getUser();
  if (!userData.user?.email_confirmed_at) redirect("/check-email");
  const { data: profile } = await db.from("profiles").select("deactivated_at").eq("id", uid).maybeSingle();
  if (!profile?.deactivated_at) redirect("/app");

  const params = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fbfaf7] px-6 py-12 text-[#16251f]">
      <section className="w-full max-w-md border-y border-black/10 py-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#087456]">Account access</p>
        <h1 className="mt-3 font-serif text-4xl tracking-[-0.02em]">Your account is deactivated</h1>
        <p className="mt-4 text-sm leading-6 text-black/60">Reactivate your account below to restore access.</p>
        {params.error && <p className="mt-5 border-l-2 border-red-400 px-3 py-2 text-sm text-red-700" role="alert">{params.error}</p>}
        <form action={reactivateAccount} className="mt-8">
          <button type="submit" className="rounded-md bg-[#087456] px-5 py-3 text-sm font-semibold text-white hover:bg-[#075d46]">Reactivate account</button>
        </form>
      </section>
    </main>
  );
}
