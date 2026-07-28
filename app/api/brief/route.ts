import { NextRequest, NextResponse } from "next/server";
import { buildTop10 } from "@/lib/brief";
import { resolveParams } from "@/lib/categories";
import { recallGood, rememberGood } from "@/lib/last-good";
import { SOURCES } from "@/lib/sources";
import type { BriefResponse, FeedItem, SourceId } from "@/lib/types";

/**
 * Aggregation pass feeding the Daily Top 10 panel. Always global (trending
 * category) — a single definitive daily list. The adapters hit the same
 * upstream URLs as the deck columns, so the Next data cache makes this
 * nearly free when columns are already loaded.
 */

const BRIEF_SOURCES: SourceId[] = ["reddit", "rss", "hackernews", "bluesky", "youtube", "papers"];
const CACHE_KEY = "brief";

export async function GET(req: NextRequest) {
  const fresh = req.nextUrl.searchParams.get("fresh") === "1";

  const settled = await Promise.allSettled(
    BRIEF_SOURCES.map((s) =>
      SOURCES[s](resolveParams(s, "trending", new URLSearchParams()), fresh)
    )
  );
  const items: FeedItem[] = settled
    .filter((r): r is PromiseFulfilledResult<FeedItem[]> => r.status === "fulfilled")
    .flatMap((r) => r.value);

  try {
    if (!items.length) {
      const firstErr = settled.find((r) => r.status === "rejected") as
        | PromiseRejectedResult
        | undefined;
      throw firstErr?.reason instanceof Error
        ? firstErr.reason
        : new Error("All brief sources failed");
    }
    const body: BriefResponse = {
      top10: buildTop10(items),
      fetchedAt: new Date().toISOString(),
    };
    rememberGood(CACHE_KEY, body);
    return NextResponse.json(body, {
      headers: {
        "Cache-Control": fresh
          ? "no-store"
          : "public, s-maxage=900, stale-while-revalidate=1800",
      },
    });
  } catch (e) {
    const cached = recallGood<BriefResponse>(CACHE_KEY);
    if (cached) {
      const body: BriefResponse = {
        ...cached.value,
        fetchedAt: new Date(cached.at).toISOString(),
        stale: true,
      };
      return NextResponse.json(body, {
        headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300" },
      });
    }
    const message = e instanceof Error ? e.message : "Brief build failed";
    return NextResponse.json(
      { error: message },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
