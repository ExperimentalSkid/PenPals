import Link from "next/link";
import BrandLogo from "./components/BrandLogo";
import FrontPageBird from "./components/FrontPageBird";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-8 sm:px-10">
      <nav className="flex items-center justify-between">
        <Link href="/" aria-label="pen-pals.net home" className="inline-flex items-center">
          <BrandLogo variant="wordmark" priority className="h-auto w-[9.5rem]" />
        </Link>
        <div className="flex items-center gap-3 text-sm font-semibold">
          <Link href="/sign-in" className="rounded-full px-4 py-2 text-[#102A43] hover:bg-white">Sign in</Link>
          <Link href="/sign-up" className="rounded-full bg-[#073A73] px-5 py-2.5 text-white shadow-sm hover:bg-[#052D59]">Join pen-pals.net</Link>
        </div>
      </nav>

      <section className="relative grid flex-1 items-center gap-12 pb-16 pt-20 lg:grid-cols-[1.1fr_.9fr] lg:gap-16 lg:pb-24 lg:pt-28">
        <FrontPageBird className="pointer-events-none absolute left-[55%] top-0 z-0 hidden w-[min(29rem,38vw)] -translate-x-1/2 lg:block" />
        <div className="front-page-hero-copy relative z-10 lg:pt-8">
          <p className="mb-6 inline-flex rounded-full bg-orange-100 px-4 py-2 text-sm font-semibold text-orange-800">A thoughtful way to meet the world</p>
          <h1 className="max-w-3xl text-5xl font-bold leading-[1.05] tracking-tight text-[#102A43] sm:text-7xl">Meet curious people around the world.</h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-[#66717C]">Find international pen pals, share everyday stories, and build friendships across borders.</p>
          <div className="mt-9 flex flex-wrap items-center gap-3 sm:gap-4">
            <Link href="/sign-up" className="motion-safe:transition-transform motion-safe:duration-300 motion-safe:hover:-translate-y-0.5 rounded-full bg-[#073A73] px-7 py-3.5 font-semibold text-white shadow-lg shadow-[#073A73]/15 hover:bg-[#052D59]">Find your people <span aria-hidden>→</span></Link>
            <Link href="/sign-in" className="rounded-full border border-[#D9D3C8] bg-white/60 px-7 py-3.5 font-semibold text-[#102A43] hover:bg-white">I already have an account</Link>
          </div>
          <div className="mt-12 flex gap-8 text-sm text-[#66717C]">
            <span><strong className="text-[#073A73]">🌎</strong> 190+ countries</span>
            <span><strong className="text-[#073A73]">💬</strong> Real conversations</span>
          </div>
        </div>

        <div className="front-page-conversation-card relative z-10 mx-auto w-full max-w-lg lg:mt-12">
          <div className="absolute -inset-7 rounded-[3.5rem] bg-orange-200/45 blur-3xl" />
          <div className="relative rounded-[2.25rem] border border-[#60A4E1]/20 bg-[#073A73] p-6 text-white shadow-[0_24px_50px_rgba(7,58,115,.2)]">
            <div className="rounded-[1.75rem] border border-[#D9D3C8]/60 bg-[#F1EBDF] p-6 text-[#102A43]">
              <div className="flex items-center justify-between text-xs font-semibold text-[#66717C]">
                <span>YOUR NEXT HELLO</span>
                <span className="rounded-full bg-orange-100 px-3 py-1 text-orange-700">4 min read</span>
              </div>
              <div className="mt-8 flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-orange-300 text-2xl">🌻</div>
                <div>
                  <h2 className="text-xl font-bold">Meet Yuki</h2>
                  <p className="text-sm text-[#66717C]">Osaka, Japan · Loves cooking</p>
                </div>
              </div>
              <p className="mt-7 text-lg leading-8">“What is one small thing that made you smile this week?”</p>
              <div className="mt-7 rounded-2xl bg-white p-4 text-sm text-[#66717C] shadow-sm">A gentle prompt to start something genuine.</div>
            </div>
            <p className="px-2 pb-1 pt-5 text-center text-sm text-[#E7F1FA]">No swiping. No follower counts. Just people.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
