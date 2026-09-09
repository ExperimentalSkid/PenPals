import Link from "next/link";

export default function PublicFooter({ className = "" }: { className?: string }) {
  return (
    <footer className={`border-t border-[#D9D3C8] py-7 text-sm text-[#66717C] ${className}`}>
      <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2" aria-label="Public site links">
        <Link href="/faq" className="font-medium text-[#073A73] underline-offset-4 hover:underline">FAQ</Link>
        <Link href="/privacy" className="font-medium text-[#073A73] underline-offset-4 hover:underline">Privacy &amp; data rights</Link>
        <Link href="/contact" className="font-medium text-[#073A73] underline-offset-4 hover:underline">Contact</Link>
        <Link href="/sign-in" className="font-medium text-[#073A73] underline-offset-4 hover:underline">Sign in</Link>
      </nav>
    </footer>
  );
}
