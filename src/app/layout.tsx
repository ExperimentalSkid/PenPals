import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthSession } from "@/components/auth-session";
import { NextIntlClientProvider } from "next-intl";
import { getPageI18n } from "@/i18n/server";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://pen-pals.net"),
  title: "Meet people, not followers | pen-pals.net",
  description:
    "A thoughtful place to meet people around the world through real conversations, shared interests, and genuine correspondence. No swiping. No follower counts. Just people.",
  applicationName: "pen-pals.net",
  manifest: "/assets/brand/favicons/site.webmanifest",
  icons: {
    icon: [
      { url: "/assets/brand/favicons/favicon.ico" },
      { url: "/assets/brand/favicons/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/assets/brand/favicons/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/assets/brand/favicons/apple-touch-icon.png",
  },
  openGraph: {
    title: "Meet people, not followers | pen-pals.net",
    description:
      "A thoughtful place to meet people around the world through real conversations, shared interests, and genuine correspondence. No swiping. No follower counts. Just people.",
    siteName: "pen-pals.net",
    type: "website",
    images: [
      {
        url: "https://pen-pals.net/assets/brand/social-preview-1200x630.png",
        width: 1200,
        height: 630,
        alt: "pen-pals.net",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Meet people, not followers | pen-pals.net",
    description:
      "A thoughtful place to meet people around the world through real conversations, shared interests, and genuine correspondence. No swiping. No follower counts. Just people.",
    images: [
      "https://pen-pals.net/assets/brand/social-preview-1200x630.png",
    ],
  },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { locale, messages } = await getPageI18n();
  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <AuthSession />
          <div id="main-content" className="min-h-0 flex-1">{children}</div>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
