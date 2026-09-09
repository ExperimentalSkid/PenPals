import type { Metadata } from "next";
import Link from "next/link";
import PublicInfoPage from "@/app/components/PublicInfoPage";
import { seoSiteOrigin } from "@/lib/seo/public";
import { submitPublicContact } from "./actions";
import ContactSubmitButton from "./ContactSubmitButton";

const topics = [
  ["account_access", "Account access"],
  ["privacy_safety", "Privacy or safety"],
  ["bug_report", "Bug report"],
  ["feedback", "Feedback"],
  ["other", "Other"],
] as const;

export const metadata: Metadata = {
  title: "Contact | pen-pals.net",
  description: "Contact pen-pals.net about account access, privacy, safety, bugs, feedback, or general questions.",
  alternates: { canonical: `${seoSiteOrigin()}/contact` },
  openGraph: {
    title: "Contact | pen-pals.net",
    description: "Contact pen-pals.net about account access, privacy, safety, bugs, feedback, or general questions.",
    url: `${seoSiteOrigin()}/contact`,
    type: "website",
  },
};

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ error?: string; sent?: string }> }) {
  const query = await searchParams;

  return (
    <PublicInfoPage
      eyebrow="Contact"
      title="Contact pen-pals.net"
      intro="Send a message if you need help before you can sign in, or if you have a privacy, safety, bug, or account question."
    >
      {query.sent ? (
        <section className="rounded-2xl border border-[#D9D3C8] bg-white/55 p-6 shadow-[0_8px_24px_rgba(16,42,67,.035)]">
          <p className="eyebrow">Message sent</p>
          <h2 className="mt-2 font-serif text-3xl text-[#102A43]">Thanks, we have your message.</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[#66717C] sm:text-base">If a reply is needed, we will use the email address you provided.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/" className="btn-primary">Back to home</Link>
            <Link href="/faq" className="btn-secondary">Read the FAQ</Link>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-[#D9D3C8] bg-white/55 p-5 shadow-[0_8px_24px_rgba(16,42,67,.035)] sm:p-7">
          <div className="border-b border-[#D9D3C8] pb-5">
            <h2 className="font-serif text-3xl text-[#102A43]">Send a message</h2>
            <p className="mt-2 text-sm leading-6 text-[#66717C]">Do not include passwords, payment details, or private verification codes.</p>
          </div>
          {query.error && <p className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700" role="alert">{query.error}</p>}
          <form action={submitPublicContact} className="mt-6 space-y-5">
            <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
            <label className="field-label">
              Name <span className="font-normal text-black/45">(optional)</span>
              <input name="name" maxLength={120} autoComplete="name" className="field mt-2 block w-full" />
            </label>
            <label className="field-label">
              Email
              <input name="email" type="email" maxLength={254} autoComplete="email" required className="field mt-2 block w-full" />
            </label>
            <label className="field-label">
              Topic
              <select name="topic" required defaultValue="" className="field mt-2 block w-full">
                <option value="" disabled>Choose a topic</option>
                {topics.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="field-label">
              Subject
              <input name="subject" required minLength={3} maxLength={200} className="field mt-2 block w-full" placeholder="A short summary" />
            </label>
            <label className="field-label">
              Message
              <textarea name="message" required minLength={10} maxLength={4000} rows={8} className="field mt-2 block w-full resize-y leading-7" placeholder="Tell us what happened or what you need help with." />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#D9D3C8] pt-5">
              <p className="max-w-md text-xs leading-5 text-black/50">If you can already sign in, Help &amp; support inside the app is the best place for account-specific requests.</p>
              <ContactSubmitButton />
            </div>
          </form>
        </section>
      )}
    </PublicInfoPage>
  );
}
