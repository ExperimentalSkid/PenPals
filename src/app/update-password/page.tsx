import Link from "next/link";
import UpdatePasswordForm from "./UpdatePasswordForm";
import BrandLogo from "@/app/components/BrandLogo";

export default async function UpdatePassword({ searchParams }: { searchParams: Promise<{ error?: string; updated?: string }> }) {
  const { error, updated } = await searchParams;
  return (
    <main className="min-h-screen bg-[#f7f5ef] px-6 py-12 text-[#16251f] sm:py-20">
      <div className="mx-auto w-full max-w-md">
        <Link href="/" aria-label="pen-pals.net home" className="inline-flex items-center">
          <BrandLogo variant="wordmark" priority className="h-auto w-[9.5rem]" />
        </Link>
        <header className="mt-16">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#087456]">Account recovery</p>
          <h1 className="mt-3 font-serif text-5xl leading-none text-[#10231d]">Choose a new password</h1>
          <p className="mt-4 text-base leading-7 text-black/60">Use at least 8 characters. Save to return to your conversations.</p>
        </header>
        <UpdatePasswordForm error={error ?? null} updated={updated === "1"} />
      </div>
    </main>
  );
}
