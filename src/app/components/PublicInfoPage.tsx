import type { ReactNode } from "react";
import Link from "next/link";
import BrandLogo from "./BrandLogo";
import PublicFooter from "./PublicFooter";

export default function PublicInfoPage({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[#f7f5ef] px-6 py-8 text-[#102A43] sm:px-10">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-5xl flex-col">
        <nav className="flex items-center justify-between gap-4">
          <Link href="/" aria-label="pen-pals.net home" className="inline-flex items-center">
            <BrandLogo variant="wordmark" priority className="h-auto w-[9.5rem]" />
          </Link>
          <div className="flex items-center gap-3 text-sm font-semibold">
            <Link href="/sign-in" className="rounded-full px-4 py-2 text-[#102A43] hover:bg-white">Sign in</Link>
            <Link href="/sign-up" className="rounded-full bg-[#073A73] px-5 py-2.5 text-white shadow-sm hover:bg-[#052D59]">Join</Link>
          </div>
        </nav>

        <header className="border-b border-[#D9D3C8] pb-10 pt-16 sm:pt-20">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="mt-3 max-w-3xl font-serif text-5xl leading-none tracking-[-0.03em] text-[#102A43] sm:text-6xl">{title}</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-[#66717C]">{intro}</p>
        </header>

        <div className="flex-1 py-10">{children}</div>

        <PublicFooter />
      </div>
    </main>
  );
}
