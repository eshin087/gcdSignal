import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

/**
 * Keep-warm: hit the public URLs of the default deck so both the Next data
 * cache (global) and the CDN entry (this region) are refreshed before they
 * expire. Scheduled every 5 minutes from a GitHub Actions workflow — Vercel
 * Hobby crons are limited to once a day. A cache miss costs a visitor ~1.8s;
 * with this, they get the ~20ms cached path.
 */
const TARGETS = [
  "/api/brief",
  ...["reddit", "rss", "youtube", "bluesky", "hackernews"].map(
    (s) => `/api/feeds/${s}?category=trending`
  ),
];

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Go through the public hostname (the CDN), not the lambda directly.
  const prodHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const origin = prodHost ? `https://${prodHost}` : req.nextUrl.origin;

  const results = await Promise.allSettled(
    TARGETS.map(async (path) => {
      const started = Date.now();
      const res = await fetch(`${origin}${path}`, {
        cache: "no-store",
        headers: { "User-Agent": "gcdSignal-warm/1.0" },
        signal: AbortSignal.timeout(25_000),
      });
      // Drain so the body is fully produced and the connection is reusable.
      await res.arrayBuffer();
      return {
        path,
        status: res.status,
        ms: Date.now() - started,
        cache: res.headers.get("x-vercel-cache"),
      };
    })
  );

  const rows = results.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : {
          path: TARGETS[i],
          status: 0,
          ms: 0,
          error: r.reason instanceof Error ? r.reason.message : "failed",
        }
  );
  const ok = rows.every((r) => r.status === 200);
  return NextResponse.json(
    { ok, origin, warmedAt: new Date().toISOString(), targets: rows },
    { status: ok ? 200 : 207, headers: { "Cache-Control": "no-store" } }
  );
}
