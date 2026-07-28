import type { Metadata, Viewport } from "next";
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
  title: "gcd signal — trending AI, one dashboard",
  description:
    "The most trending AI content from Reddit, X, YouTube, Bluesky, GitHub, Hacker News, research papers, and major tech sites — in one deck.",
};

export const viewport: Viewport = {
  themeColor: "#0a0a0b",
};

// Runs before paint: dark is the server-rendered default, so this only ever
// needs to switch dark → light for users who opted in.
const THEME_SCRIPT =
  "(function(){try{if(localStorage.getItem('gcdsignal:theme')==='light')document.documentElement.classList.remove('dark')}catch(e){}})()";

// Same pre-paint trick for the text-size scale (md is the attribute-less default).
const TEXT_SCRIPT =
  "(function(){try{var t=JSON.parse(localStorage.getItem('gcdsignal:prefs')||'{}').textScale;if(t==='sm'||t==='lg'||t==='xl')document.documentElement.setAttribute('data-text',t)}catch(e){}})()";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark h-full ${geistSans.variable} ${geistMono.variable} antialiased`}
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
