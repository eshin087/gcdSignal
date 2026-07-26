import { NextRequest, NextResponse } from "next/server";
import { isCategoryId, resolveParams } from "@/lib/categories";
import { isSourceId, SOURCES } from "@/lib/sources";
import type { FeedResponse } from "@/lib/types";

const SUB_RE = /^[A-Za-z0-9_+]{1,120}$/;
const BOARD_RE = /^[a-z0-9]{1,10}$/;
const TAG_RE = /^[A-Za-z0-9_]{1,64}$/;
const INSTANCE_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;

function validationError(sp: URLSearchParams): string | null {
  const sub = sp.get("sub");
  if (sub !== null && !SUB_RE.test(sub)) return "Invalid subreddit";
  const board = sp.get("board");
  if (board !== null && !BOARD_RE.test(board)) return "Invalid board";
  const tag = sp.get("tag");
  if (tag !== null && !TAG_RE.test(tag)) return "Invalid hashtag";
  const instance = sp.get("instance");
  if (instance !== null && !INSTANCE_RE.test(instance)) return "Invalid instance";
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

  try {
    const items = await SOURCES[source](resolveParams(source, category, sp));
    const body: FeedResponse = { source, items, fetchedAt: new Date().toISOString() };
    return NextResponse.json(body, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Upstream fetch failed";
    return NextResponse.json(
      { error: message },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
