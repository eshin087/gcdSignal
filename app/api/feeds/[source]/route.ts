import { NextRequest, NextResponse } from "next/server";
import { isCategoryId, resolveParams } from "@/lib/categories";
import { recallGood, rememberGood } from "@/lib/last-good";
import { isSourceId, SOURCES } from "@/lib/sources";
import type { FeedItem, FeedResponse } from "@/lib/types";

const SUB_RE = /^[A-Za-z0-9_+]{1,160}$/;
const BOARD_RE = /^[a-z0-9]{1,10}$/;
const CHANNEL_RE = /^(UC|UU)[A-Za-z0-9_-]{10,40}$/;

function validationError(sp: URLSearchParams): string | null {
  const sub = sp.get("sub");
  if (sub !== null && !SUB_RE.test(sub)) return "Invalid subreddit";
  const board = sp.get("board");
  if (board !== null && !BOARD_RE.test(board)) return "Invalid board";
  const channel = sp.get("channel");
  if (channel !== null && !CHANNEL_RE.test(channel)) return "Invalid channel id";
  const q = sp.get("q");
  if (q !== null && (q.length < 1 || q.length > 100)) return "Invalid query";
  const url = sp.get("url");
  if (url !== null) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return "Invalid feed URL";
    }
    const host = parsed.hostname.toLowerCase();
    const isIpLiteral = /^[\d.]+$/.test(host) || host.includes(":");
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      isIpLiteral ||
      host === "localhost" ||
      host.endsWith(".local") ||
      host.endsWith(".internal")
    ) {
      return "Invalid feed URL";
    }
  }
  return null;
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ source: string }> }
) {
  const { source } = await ctx.params;
  if (!isSourceId(source)) {
    return NextResponse.json({ error: `Unknown source '${source}'` }, { status: 400 });
  }

  const sp = req.nextUrl.searchParams;
  const invalid = validationError(sp);
  if (invalid) {
    return NextResponse.json({ error: invalid }, { status: 400 });
  }

  const categoryParam = sp.get("category");
  const category = isCategoryId(categoryParam) ? categoryParam : "trending";
  // Manual refreshes bypass both the data cache (adapters get revalidate: 0)
  // and the CDN cache (no-store below) — otherwise "refresh" replays 5-min-old data.
  const fresh = sp.get("fresh") === "1";

  const params = resolveParams(source, category, sp);
  const cacheKey = `${source}|${category}|${JSON.stringify(params)}`;
  // Built-in Trending must feel current: cap it at 72h. Custom feeds always
  // send explicit params (sub/url/q/...) and are exempt, as are other tabs.
  const isBuiltIn = ![...sp.keys()].some((k) => k !== "category" && k !== "fresh");
  try {
    let items = await SOURCES[source](params, fresh);
    if (category === "trending" && isBuiltIn) {
      const floor = Date.now() - 72 * 3600_000;
      items = items.filter((it) => Date.parse(it.timestamp) > floor);
    }
    rememberGood(cacheKey, items);
    const body: FeedResponse = { source, items, fetchedAt: new Date().toISOString() };
    return NextResponse.json(body, {
      headers: {
        "Cache-Control": fresh
          ? "no-store"
          : "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (e) {
    // Upstream down or rate-limiting (Reddit 429s): serve the last good result
    // for this exact feed, flagged stale, rather than an error card. Short CDN
    // TTL so recovery is retried soon.
    const cached = recallGood<FeedItem[]>(cacheKey);
    if (cached) {
      const body: FeedResponse = {
        source,
        items: cached.value,
        fetchedAt: new Date(cached.at).toISOString(),
        stale: true,
      };
      return NextResponse.json(body, {
        headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300" },
      });
    }
    const message = e instanceof Error ? e.message : "Upstream fetch failed";
    return NextResponse.json(
      { error: message },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
