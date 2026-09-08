import { NextRequest, NextResponse } from "next/server";
import { parseFeedRequest } from "@/lib/feed-request";
import { recallGood, rememberGood } from "@/lib/last-good";
import { applyRelevance } from "@/lib/relevance";
import { isSourceId, loadSource } from "@/lib/sources";
import { canonicalKey, sharedServerLoad } from "@/lib/server-cache";
import { healthDetail, sourceHealth, summarizeHealth } from "@/lib/source-health";
import type { FeedResponse } from "@/lib/types";

const CACHE_FRESH = "public, max-age=60, s-maxage=300, stale-while-revalidate=300";
const CACHE_STALE = "public, max-age=30, s-maxage=60";
export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ source: string }> }) {
  const { source } = await ctx.params;
  if (!isSourceId(source)) return NextResponse.json({ error: "Unknown source" }, { status: 400 });
  let parsed: ReturnType<typeof parseFeedRequest>;
  try { parsed = parseFeedRequest(source, req.nextUrl.searchParams); }
  catch { return NextResponse.json({ error: "Invalid feed parameters. Custom RSS requires a public HTTPS URL." }, { status: 400 }); }
  // Legacy fresh=1 is a browser refresh, never an upstream bypass. Redirect also
  // collapses arbitrary cache-busting parameters onto the canonical CDN entry.
  if (req.nextUrl.searchParams.toString() !== parsed.canonicalQuery) {
    const target = req.nextUrl.clone();
    target.search = parsed.canonicalQuery;
    return NextResponse.redirect(target, { status: 308, headers: { "Cache-Control": "public, max-age=60" } });
  }
  const cacheKey = canonicalKey(`feed:${source}:${parsed.category}:${parsed.custom}`, parsed.params);
  const body = await sharedServerLoad<FeedResponse>(cacheKey, async () => {
    try {
      const raw = await loadSource(source, parsed.params);
      const health = sourceHealth(raw, source);
      let items = applyRelevance(source, raw, { custom: parsed.custom });
      if (parsed.category === "trending" && !parsed.custom) {
        const floor = Date.now() - 72 * 3600_000;
        items = items.filter((item) => Date.parse(item.timestamp) > floor);
      }
      const checkedAt = health.details?.map((detail) => detail.checkedAt ?? "").sort().at(-1);
      const result: FeedResponse = { schemaVersion: 2, source, items, health, fetchedAt: checkedAt || new Date().toISOString(),
        ...(health.succeeded === 0 && health.details?.some((detail) => detail.status === "stale") ? { stale: true } : {}) };
      if (!result.stale) rememberGood(cacheKey, result);
      return result;
    } catch {
      const cached = recallGood<FeedResponse>(cacheKey);
      if (cached) return {
        ...cached.value, stale: true,
        health: summarizeHealth((cached.value.health?.details ?? [{ id: source }]).map((detail) =>
          healthDetail(detail.id, "stale", "lastSuccessAt" in detail ? detail.lastSuccessAt : cached.value.fetchedAt))),
      };
      return { schemaVersion: 2, source, items: [], fetchedAt: new Date().toISOString(),
        health: summarizeHealth([healthDetail(source, "error")]), error: "Source temporarily unavailable. Try again later." };
    }
  }).catch((): FeedResponse => ({ schemaVersion: 2, source, items: [], fetchedAt: new Date().toISOString(),
    health: summarizeHealth([healthDetail(source, "error")]), error: "Feed service is busy. Try again later." }));
  return NextResponse.json(body, { headers: { "Cache-Control": body.stale || body.error ? CACHE_STALE : CACHE_FRESH } });
}
