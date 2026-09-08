import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

/**
 * Keep-warm: hit the public URLs of the default deck so both the Next data
 * cache (global) and the CDN entry (this region) are refreshed before they
 * expire. Scheduled every five minutes from a GitHub Actions workflow.
 * This is best-effort warming, not a guarantee of cache hits or healthy sources.
 */
const TARGETS = [
  "/api/brief?category=trending&phase=primary&window=24",
  "/api/brief?category=trending&phase=all&window=24",
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
      const body = await res.json() as { error?: string; stale?: boolean; health?: { degraded?: boolean; succeeded?: number; total?: number } };
      const healthy = res.ok && !body.error && !body.stale && !body.health?.degraded;
      return {
        path,
        status: res.status,
        healthy,
        sources: body.health ? `${body.health.succeeded ?? 0}/${body.health.total ?? 0}` : undefined,
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
          healthy: false,
          error: "Warm request failed",
        }
  );
  const ok = rows.every((r) => r.status === 200 && r.healthy);
  return NextResponse.json(
    { ok, origin, warmedAt: new Date().toISOString(), targets: rows },
    { status: ok ? 200 : 207, headers: { "Cache-Control": "no-store" } }
  );
}
