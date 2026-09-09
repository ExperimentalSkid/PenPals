import type { Metadata } from "next";
import Link from "next/link";
import PublicInfoPage from "@/app/components/PublicInfoPage";
import { seoSiteOrigin } from "@/lib/seo/public";

export const metadata: Metadata = {
  title: "Privacy & data rights | pen-pals.net",
  description: "How pen-pals.net handles account data, profile data, conversations, privacy controls, exports, deletion, and data-rights requests.",
  alternates: { canonical: `${seoSiteOrigin()}/privacy` },
  openGraph: {
    title: "Privacy & data rights | pen-pals.net",
    description: "How pen-pals.net handles account data, profile data, conversations, privacy controls, exports, deletion, and data-rights requests.",
    url: `${seoSiteOrigin()}/privacy`,
    type: "website",
  },
};

export default function PrivacyPage() {
  return (
    <PublicInfoPage
      eyebrow="Privacy"
      title="Privacy & data rights"
      intro="This page explains what pen-pals.net uses data for, what members can control, and where account export or deletion lives."
    >
      <div className="space-y-8 text-[#66717C]">
        <section className="rounded-2xl border border-[#D9D3C8] bg-white/55 p-5 shadow-[0_8px_24px_rgba(16,42,67,.035)] sm:p-6">
          <p className="text-sm leading-7">Last updated: September 9, 2026</p>
          <p className="mt-4 text-sm leading-7 sm:text-base">
            pen-pals.net uses personal data to run accounts, profiles, introductions, messages, Snail Mail, settings, support, moderation, safety checks, and basic service security. It does not sell member profiles or private conversations.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-3xl text-[#102A43]">Data the app uses</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {[
              ["Account data", "Email, account creation time, login state, confirmation state, and authentication activity available to the app."],
              ["Profile data", "Display name, username, age-related birth-date data, location choices, languages, interests, bio, photos, badges, and profile settings."],
              ["Communication data", "Introductions, conversations, messages, Snail Mail letters, delivery/read state, notifications, and contact preferences."],
              ["Privacy and safety data", "Blocks, reports, moderation records, support tickets, attachment metadata, availability choices, and private verification status."],
            ].map(([title, body]) => (
              <article key={title} className="rounded-2xl border border-[#D9D3C8] bg-white/45 p-5">
                <h3 className="text-sm font-semibold text-[#102A43]">{title}</h3>
                <p className="mt-2 text-sm leading-6">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section>
          <h2 className="font-serif text-3xl text-[#102A43]">What other members can see</h2>
          <p className="mt-4 max-w-3xl text-sm leading-7 sm:text-base">
            Public profile views use privacy-aware server checks. Members can control profile visibility, city display, activity status, response-rate display, communication modes, blocked users, and who can send new introductions. Verification shows only whether a profile is verified, not the private method used.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-3xl text-[#102A43]">Community statistics</h2>
          <p className="mt-4 max-w-3xl text-sm leading-7 sm:text-base">
            pen-pals.net may publish privacy-safe aggregate community statistics, such as how many Pen-Pals.net members are in a country or speak a language. These numbers describe this site&apos;s members only. They are not claims about the general population, and small cohorts are suppressed.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-3xl text-[#102A43]">Download, correct, or delete data</h2>
          <p className="mt-4 max-w-3xl text-sm leading-7 sm:text-base">
            Signed-in members can download a machine-readable account export from Settings. The export includes account, profile, settings, language and interest selections, communication history, notifications, blocks, photo-access records, and user-submitted reports where the app can safely provide them. Passwords, tokens, service credentials, other members&apos; private profile fields, reporter identities, and protected moderator evidence are not included.
          </p>
          <p className="mt-4 max-w-3xl text-sm leading-7 sm:text-base">
            Members can correct profile information in profile setup and Settings. Permanent deletion removes the account, profile, owned data, notifications, photo permissions, blocks, and avatar references. Shared conversations may remain available to the other participant with the deleted sender shown as Deleted user. Some authentication, safety, or legal records may be retained only where the current provider or configured retention rules require it.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/sign-in" className="btn-primary">Sign in to manage data</Link>
            <Link href="/contact" className="btn-secondary">Contact us</Link>
          </div>
        </section>

        <section>
          <h2 className="font-serif text-3xl text-[#102A43]">Your rights</h2>
          <p className="mt-4 max-w-3xl text-sm leading-7 sm:text-base">
            Depending on where you live, privacy laws may give you rights to access, correct, delete, restrict, export, or object to certain processing of your personal data. pen-pals.net is built around those practical controls where possible: export, correction, deletion, privacy settings, blocking, and support requests.
          </p>
        </section>

        <section className="rounded-2xl border border-[#D9D3C8] bg-[#E7F1FA]/55 p-5 sm:p-6">
          <h2 className="font-serif text-3xl text-[#102A43]">Contact</h2>
          <p className="mt-4 text-sm leading-7 sm:text-base">
            For privacy or data-rights questions, use the contact form. If you can sign in, you can also open Help &amp; support from the app.
          </p>
          <Link href="/contact" className="mt-5 inline-flex btn-primary">Contact us</Link>
        </section>
      </div>
    </PublicInfoPage>
  );
}
