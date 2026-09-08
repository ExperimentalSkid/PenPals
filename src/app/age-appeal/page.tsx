import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { submitAgeAppeal } from "./actions";

export default async function AgeAppeal({ searchParams }: { searchParams: Promise<{ error?: string; submitted?: string }> }) {
  const query = await searchParams;
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  const authenticated = Boolean(data?.claims?.sub);
  return <main className="mx-auto w-full max-w-xl px-6 py-16 text-[#16251f] sm:py-24">
    <Link href="/sign-in" className="text-sm font-medium text-[#087456] hover:underline">← Back to sign in</Link>
    <p className="mt-12 text-xs font-bold uppercase tracking-[.2em] text-[#087456]">Age correction</p>
    <h1 className="mt-3 font-serif text-5xl tracking-[-0.03em] text-[#10231d]">Entered your date of birth incorrectly?</h1>
    <p className="mt-5 max-w-lg text-base leading-7 text-black/60">Request a correction using the verified email on your restricted account. We only use this information to review the request.</p>
    {!authenticated && <p className="mt-8 border-l-2 border-black/15 px-3 py-2 text-sm text-black/60">Sign in to the verified account linked to your request, then return here to submit the correction. You can send this request without setting up a profile.</p>}
    {query.error && <p className="mt-8 border-l-2 border-red-400 px-3 py-2 text-sm text-red-700" role="alert">{query.error}</p>}
    {query.submitted ? <p className="mt-8 border-l-2 border-[#087456] px-3 py-2 text-sm text-[#075d46]">Your correction request was submitted for review.</p> : authenticated && <form action={submitAgeAppeal} className="mt-10 space-y-6 border-t border-black/10 pt-8">
      <label className="block text-sm font-medium">Correct date of birth<input name="corrected_birth_date" type="date" required className="field mt-2 w-full" /></label>
      <label className="block text-sm font-medium">Short explanation <span className="font-normal text-black/45">(optional)</span><textarea name="explanation" maxLength={500} rows={4} className="field mt-2 w-full" placeholder="Tell us what happened." /></label>
      <button className="btn-primary px-5 py-3">Request a correction</button>
    </form>}
  </main>;
}
