import Link from "next/link";
import { requestPasswordReset } from "@/app/auth/actions";
import AuthSubmitButton from "@/app/auth/AuthSubmitButton";
import BrandLogo from "@/app/components/BrandLogo";

export default async function ForgotPassword({ searchParams }: { searchParams: Promise<{ message?: string; error?: string }> }) {
  const { message, error } = await searchParams;
  return (
    <main className="min-h-screen bg-[#f7f5ef] px-6 py-12 text-[#16251f] sm:py-20">
      <div className="mx-auto w-full max-w-md">
        <Link href="/" aria-label="pen-pals.net home" className="inline-flex items-center">
          <BrandLogo variant="wordmark" priority className="h-auto w-[9.5rem]" />
        </Link>
        <Link href="/sign-in" className="mt-3 block text-sm text-black/55 underline-offset-4 hover:text-[#075d46] hover:underline">
          Back to sign in
        </Link>

        <header className="mt-16">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#087456]">Account recovery</p>
          <h1 className="mt-3 font-serif text-5xl leading-none text-[#10231d]">Reset your password</h1>
          <p className="mt-4 text-base leading-7 text-black/60">Enter your email. If an account exists, we&apos;ll send a reset link.</p>
        </header>

        {message && <p role="status" aria-live="polite" className="mt-8 rounded-md border border-[#b9d8c8] bg-[#edf7f0] px-4 py-3 text-sm leading-6 text-[#075d46]">If that email is registered, a reset link is on its way. Check your inbox and spam folder.</p>}
        {error === "unavailable" && <p role="alert" aria-live="assertive" className="mt-8 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">Password recovery is temporarily unavailable. Please try again later.</p>}
        {error === "session" && <p role="alert" aria-live="assertive" className="mt-8 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">That reset session has expired. Request a new link to continue.</p>}

        <form action={requestPasswordReset} className="mt-8 space-y-5">
          <label htmlFor="recovery-email" className="field-label">
            Email
            <input id="recovery-email" name="email" type="email" autoComplete="email" required className="field mt-2 block w-full" />
          </label>
          <AuthSubmitButton idleLabel="Send reset link" pendingLabel="Sending…" />
        </form>
      </div>
    </main>
  );
}
