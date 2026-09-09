import type { Metadata } from "next";
import Link from "next/link";
import PublicInfoPage from "@/app/components/PublicInfoPage";
import { seoSiteOrigin } from "@/lib/seo/public";

const faqs = [
  {
    question: "What is pen-pals.net?",
    answer: "pen-pals.net helps people meet international pen pals through profiles, introductions, messages, and digital Snail Mail.",
  },
  {
    question: "Do I need to finish my profile before using the site?",
    answer: "Yes. New members complete a short onboarding step with basic profile details such as age, country, languages, and interests before entering the main app. This keeps discovery useful and avoids empty profiles.",
  },
  {
    question: "What happens after I send an introduction?",
    answer: "The other person can read it and choose whether to reply. When they reply, the introduction becomes a conversation.",
  },
  {
    question: "What is Snail Mail?",
    answer: "Snail Mail is a slower digital letter format inside existing connections. It is built for longer, calmer messages rather than instant back-and-forth chat.",
  },
  {
    question: "What does a verified profile mean?",
    answer: "A verified profile means the account recently passed one of the available private verification checks, such as authenticator verification. Other members see only the verified status, not the method used.",
  },
  {
    question: "Can I control who contacts me?",
    answer: "Yes. Settings include availability, introduction controls, blocked users, country exclusions, profile display choices, and communication-mode preferences.",
  },
  {
    question: "How do reporting and blocking work?",
    answer: "Blocking limits contact with that person. Reports go to the moderation tools for staff review. The app keeps reporter details and protected evidence away from ordinary users.",
  },
  {
    question: "Can I download or delete my data?",
    answer: "Yes. Signed-in members can download an account-data export or permanently delete their account from Settings.",
  },
];

export const metadata: Metadata = {
  title: "FAQ | pen-pals.net",
  description: "Answers to common questions about pen-pals.net accounts, onboarding, introductions, messages, Snail Mail, verification, privacy, and support.",
  alternates: { canonical: `${seoSiteOrigin()}/faq` },
  openGraph: {
    title: "FAQ | pen-pals.net",
    description: "Answers to common questions about pen-pals.net accounts, onboarding, introductions, messages, Snail Mail, verification, privacy, and support.",
    url: `${seoSiteOrigin()}/faq`,
    type: "website",
  },
};

export default function FaqPage() {
  return (
    <PublicInfoPage
      eyebrow="Help"
      title="Frequently asked questions"
      intro="Clear answers about joining, meeting people, privacy, safety, and account controls on pen-pals.net."
    >
      <div className="grid gap-5">
        {faqs.map((item) => (
          <section key={item.question} className="rounded-2xl border border-[#D9D3C8] bg-white/55 p-5 shadow-[0_8px_24px_rgba(16,42,67,.035)] sm:p-6">
            <h2 className="font-serif text-2xl text-[#102A43]">{item.question}</h2>
            <p className="mt-3 text-sm leading-7 text-[#66717C] sm:text-base">{item.answer}</p>
          </section>
        ))}
      </div>

      <section className="mt-8 rounded-2xl border border-[#D9D3C8] bg-[#E7F1FA]/55 p-5 sm:p-6">
        <h2 className="font-serif text-2xl text-[#102A43]">Need help with your account?</h2>
        <p className="mt-3 text-sm leading-7 text-[#66717C] sm:text-base">
          If you can sign in, use Help &amp; support from the app. If you cannot sign in, send a message through the contact form.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/contact" className="btn-primary">Contact us</Link>
          <Link href="/privacy" className="btn-secondary">Privacy &amp; data rights</Link>
        </div>
      </section>
    </PublicInfoPage>
  );
}
