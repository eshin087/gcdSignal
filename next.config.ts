import type { NextConfig } from "next";
import { createHash } from "node:crypto";
import { THEME_SCRIPT, TEXT_SCRIPT } from "./lib/prepaint";

const hashes = [THEME_SCRIPT, TEXT_SCRIPT].map((script) => `'sha256-${createHash("sha256").update(script).digest("base64")}'`).join(" ");
// Exact official widget origins, loaded only after an explicit Load embed action.
const widgetOrigins = "https://platform.twitter.com https://syndication.twitter.com https://cdn.syndication.twimg.com";
const reportOnlyCsp = [
  "default-src 'self'",
  `script-src 'self' ${hashes} ${widgetOrigins}${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'", "img-src 'self' https: data:", "font-src 'self'",
  `connect-src 'self' ${widgetOrigins}`,
  "frame-src https://platform.twitter.com https://syndication.twitter.com",
  "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
      // Do not enforce until Next's generated inline/RSC scripts are covered too.
      { key: "Content-Security-Policy-Report-Only", value: reportOnlyCsp },
    ] }];
  },
};

export default nextConfig;
