import Link from "next/link";
import { signUp } from "@/app/auth/actions";
import GoogleAuthButton from "@/app/auth/GoogleAuthButton";
import BrandLogo from "@/app/components/BrandLogo";

export default async function SignUp({ searchParams }: { searchParams: Promise<{ error?: string; message?: string; appeal?: string }> }) {
  const { error, message, appeal } = await searchParams;

  return (
    <main className="min-h-screen bg-[#f7f5ef] px-6 py-12 text-[#16251f] sm:py-20">
      <div className="mx-auto w-full max-w-md">
        <Link href="/" aria-label="pen-pals.net home" className="inline-flex items-center">
          <BrandLogo variant="wordmark" priority className="h-auto w-[9.5rem]" />
        </Link>

        <header className="mt-16">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#087456]">Join pen-pals.net</p>
          <h1 className="mt-3 font-serif text-5xl leading-none text-[#10231d]">Start a new friendship</h1>
        <p className="mt-4 text-base leading-7 text-black/60">Create your account and meet international pen pals.</p>
        </header>

        <div className="mt-9 space-y-4">
          <GoogleAuthButton errorPath="/sign-up" />
          <div className="flex items-center gap-3 py-1 text-xs uppercase tracking-[.16em] text-black/40">
            <span className="h-px flex-1 bg-black/10" />
            <span>or</span>
            <span className="h-px flex-1 bg-black/10" />
          </div>
        </div>

        <form action={signUp} className="mt-4 space-y-5" aria-describedby={error ? "sign-up-error" : undefined}>
          <label className="field-label">
            Email
            <input name="email" type="email" autoComplete="email" required className="field mt-2 block w-full" />
          </label>
          <label className="field-label">
            Date of birth
            <input name="birth_date" type="date" autoComplete="bday" required className="field mt-2 block w-full" />
          </label>
          <label className="field-label">
            Password
            <input name="password" type="password" autoComplete="new-password" minLength={8} required className="field mt-2 block w-full" />
            <span className="mt-1 block text-xs font-normal text-black/45">Use at least 8 characters.</span>
          </label>
          {error && (
            <p id="sign-up-error" role="alert" aria-live="assertive" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
              {error}
            </p>
          )}
          {appeal === "1" && (
            <p className="text-sm leading-6 text-black/60">
              Entered your date of birth incorrectly? <Link href="/age-appeal" className="font-semibold text-[#075d46] underline-offset-4 hover:underline">Request a correction.</Link>
            </p>
          )}
          {message && (
            <p role="status" aria-live="polite" className="rounded-md border border-[#b9d8c8] bg-[#edf7f0] px-4 py-3 text-sm leading-6 text-[#075d46]">
              {message}
            </p>
          )}
          <button className="btn-primary w-full justify-center">Create account</button>
        </form>

        <p className="mt-8 text-center text-sm text-black/60">
          Already a member? <Link href="/sign-in" className="font-semibold text-[#075d46] underline-offset-4 hover:underline">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
