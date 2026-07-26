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
    "The most popular AI posts and news from Reddit, Hacker News, Bluesky, Mastodon, 4chan, and major tech sites — in one minimal deck.",
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
};

// Runs before paint: dark is the server-rendered default, so this only ever
// needs to switch dark → light for users who opted in.
const THEME_SCRIPT =
  "(function(){try{if(localStorage.getItem('gcdsignal:theme')==='light')document.documentElement.classList.remove('dark')}catch(e){}})()";

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
      </head>
      <body className="h-dvh overflow-hidden flex flex-col font-sans bg-zinc-50 text-zinc-800 dark:bg-[#0a0a0a] dark:text-zinc-200">
        {children}
      </body>
    </html>
  );
}
