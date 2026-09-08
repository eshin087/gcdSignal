import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { THEME_SCRIPT, TEXT_SCRIPT } from "@/lib/prepaint";
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
  title: "gcd signal — your essential AI brief",
  description:
    "Important AI developments, original sources, and a searchable personal research library. A focused brief with an optional source deck.",
};

export const viewport: Viewport = {
  themeColor: "#0a0a0b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`h-full ${geistSans.variable} ${geistMono.variable} antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: TEXT_SCRIPT }} />
      </head>
      <body className="h-dvh overflow-hidden flex flex-col font-sans text-zinc-800 dark:text-zinc-200">
        {children}
      </body>
    </html>
  );
}
