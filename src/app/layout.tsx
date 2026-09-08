import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Find pen pals and international friends | pen-pals.net",
  description: "Meet pen pals from around the world, share interests, and build meaningful international friendships.",
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
    title: "Find pen pals and international friends | pen-pals.net",
    description: "Meet pen pals from around the world, share interests, and build meaningful international friendships.",
    siteName: "pen-pals.net",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Find pen pals and international friends | pen-pals.net",
    description: "Meet pen pals from around the world, share interests, and build meaningful international friendships.",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-md focus:bg-[#073A73] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
        >
          Skip to main content
        </a>
        <div id="main-content" className="min-h-0 flex-1">{children}</div>
      </body>
    </html>
  );
}
