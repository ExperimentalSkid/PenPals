export default function NotificationsLoading() {
  return <main className="min-h-full w-full bg-[#f7f5ef] px-6 py-10 text-[#16251f] sm:px-8 sm:py-12 lg:px-10 lg:py-14 xl:px-12 2xl:px-16" aria-busy="true" aria-live="polite">
    <div className="mx-auto w-full max-w-[1390px]">
      <p className="text-xs font-bold uppercase tracking-[.22em] text-[#087456]">Your updates</p>
      <div className="mt-4 h-16 w-72 animate-pulse rounded-md bg-black/5" />
      <div className="mt-5 h-7 w-[28rem] max-w-full animate-pulse rounded-md bg-black/5" />
      <p className="sr-only">Loading notifications</p>
      <div className="mt-9 h-14 animate-pulse rounded-xl border-y border-black/10 bg-black/[.02]" />
      <div className="mt-7 grid gap-7 lg:grid-cols-[minmax(0,1fr)_292px]"><div className="h-56 animate-pulse rounded-xl border border-[#e1ded5] bg-white/50" /><div className="h-64 animate-pulse rounded-xl border border-[#e3e0d8] bg-white/40" /></div>
    </div>
  </main>;
}
