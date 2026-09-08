import Link from "next/link";
import { signIn } from "@/app/auth/actions";
import AuthSubmitButton from "@/app/auth/AuthSubmitButton";
import GoogleAuthButton from "@/app/auth/GoogleAuthButton";
import BrandLogo from "@/app/components/BrandLogo";

export default async function SignIn({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;

  return (
    <main className="min-h-screen bg-[#f7f5ef] px-6 py-12 text-[#16251f] sm:py-20">
      <div className="mx-auto w-full max-w-md">
        <Link href="/" aria-label="pen-pals.net home" className="inline-flex items-center">
          <BrandLogo variant="wordmark" priority className="h-auto w-[9.5rem]" />
        </Link>
        <Link href="/" className="mt-3 block text-sm text-black/55 underline-offset-4 hover:text-[#075d46] hover:underline">
          Back to pen-pals.net
        </Link>

        <header className="mt-16">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#087456]">Welcome back</p>
          <h1 className="mt-3 font-serif text-5xl leading-none text-[#10231d]">Sign in</h1>
          <p className="mt-4 text-base leading-7 text-black/60">Continue your conversations and see what&apos;s new.</p>
        </header>

        <div className="mt-9 space-y-4">
          <GoogleAuthButton />
          <div className="flex items-center gap-3 py-1 text-xs uppercase tracking-[.16em] text-black/40">
            <span className="h-px flex-1 bg-black/10" />
            <span>or</span>
            <span className="h-px flex-1 bg-black/10" />
          </div>
        </div>

        <form action={signIn} className="mt-4 space-y-5" aria-describedby={error ? "sign-in-error" : undefined}>
          <label htmlFor="sign-in-identifier" className="field-label">
            Email or username
            <input id="sign-in-identifier" name="identifier" type="text" autoComplete="username" required className="field mt-2 block w-full" />
          </label>
          <label htmlFor="sign-in-password" className="field-label">
            Password
            <input id="sign-in-password" name="password" type="password" autoComplete="current-password" required className="field mt-2 block w-full" />
          </label>
          <div className="-mt-2 text-right text-sm"><Link href="/forgot-password" className="font-medium text-[#075d46] underline-offset-4 hover:underline">Forgot password?</Link></div>
          {error && (
            <p id="sign-in-error" role="alert" aria-live="assertive" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
              {error}
            </p>
          )}
          <AuthSubmitButton idleLabel="Sign in" pendingLabel="Signing in…" />
        </form>

        <p className="mt-8 text-center text-sm text-black/60">
          New here? <Link href="/sign-up" className="font-semibold text-[#075d46] underline-offset-4 hover:underline">Create an account</Link>
        </p>
      </div>
    </main>
  );
}
