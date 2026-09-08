import Link from "next/link";
import { resendVerificationEmail } from "@/app/auth/actions";
import BrandLogo from "@/app/components/BrandLogo";

export default async function CheckEmail({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const { error, sent } = await searchParams;

  return (
    <main className="min-h-screen bg-[#f7f5ef] px-6 py-16 text-[#16251f] sm:py-24">
      <div className="mx-auto w-full max-w-md">
        <Link href="/" aria-label="pen-pals.net home" className="inline-flex items-center">
          <BrandLogo variant="wordmark" priority className="h-auto w-[10rem]" />
        </Link>
        <p className="mt-16 text-xs font-bold uppercase tracking-[.2em] text-[#087456]">Continue</p>
        <h1 className="mt-3 font-serif text-5xl tracking-[-0.03em] text-[#10231d]">Check your email</h1>
        <p className="mt-5 text-base leading-7 text-black/65">
          If an email is associated with this address, you&apos;ll receive a message with the next steps.
        </p>

        {sent && <p className="mt-7 border-l-2 border-[#087456] px-3 py-2 text-sm text-[#075d46]" role="status">If needed, another message will arrive shortly.</p>}
        {error && <p className="mt-7 border-l-2 border-red-400 px-3 py-2 text-sm text-red-700" role="alert">We couldn&apos;t complete that request. Please try again.</p>}

        <form action={resendVerificationEmail} className="mt-10 space-y-4 border-t border-black/10 pt-8">
          <label htmlFor="verification-email" className="block text-sm font-medium text-[#10231d]">
            Email address
            <input id="verification-email" name="email" type="email" autoComplete="email" required className="field mt-2 w-full" placeholder="you@example.com" />
          </label>
          <p className="-mt-2 text-xs leading-5 text-black/50">Need another message? Enter the address for this request.</p>
          <button type="submit" className="btn-primary w-full">Send again</button>
        </form>
        <p className="mt-7 text-center text-sm text-black/55">
          Return to <Link href="/sign-in" className="font-medium text-[#075d46] hover:underline">sign in</Link>
        </p>
      </div>
    </main>
  );
}
