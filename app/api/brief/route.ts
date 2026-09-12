import { NextRequest, NextResponse } from "next/server";
import { buildTop10 } from "@/lib/brief";
import { CATEGORY_IDS, resolveParams } from "@/lib/categories";
import { selectItems } from "@/lib/curation";
import { recallGood, rememberGood } from "@/lib/last-good";
import { applyRelevance } from "@/lib/relevance";
import { loadSource } from "@/lib/sources";
import { sharedServerLoad } from "@/lib/server-cache";
import { healthDetail, sourceHealth, summarizeHealth } from "@/lib/source-health";
import type { BriefResponse, CategoryId, FeedItem, SourceHealth, SourceId } from "@/lib/types";

export const runtime = "nodejs";
const PRIMARY: SourceId[] = ["rss", "hackernews"];
const ALL: SourceId[] = [...PRIMARY, "reddit", "youtube", "papers"];

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const windowParam = sp.get("window") ?? "24";
  const phase = sp.get("phase") ?? "all";
  const category = (sp.get("category") ?? "trending") as CategoryId;
  if (!["24", "72"].includes(windowParam) || !["primary", "all"].includes(phase) ||
      !CATEGORY_IDS.includes(category) || sp.getAll("category").length > 1 ||
      sp.getAll("window").length > 1 || sp.getAll("phase").length > 1) {
    return NextResponse.json({ error: "Invalid brief parameters" }, { status: 400 });
  }
  const windowHours = Number(windowParam) as 24 | 72;
  const canonical = new URLSearchParams({ category, phase, window: windowParam });
  canonical.sort();
  if (sp.toString() !== canonical.toString()) {
    const target = req.nextUrl.clone(); target.search = canonical.toString();
    return NextResponse.redirect(target, { status: 308, headers: { "Cache-Control": "public, max-age=60" } });
  }
  const cacheKey = `brief:${category}:${phase}:${windowHours}`;
  const body = await sharedServerLoad<BriefResponse>(cacheKey, async () => {
    const sources = phase === "primary" ? PRIMARY : ALL;
    const settled = await Promise.allSettled(sources.map(async (source) => {
      const raw = await loadSource(source, resolveParams(source, category, new URLSearchParams()));
      // Provider parsing and filtering belong to this contributor's failure
      // boundary; malformed upstream data must not discard healthy sources.
      const items = selectItems(applyRelevance(source, raw),
        { contentMode: "broad", mutedAuthors: [], mutedOutlets: [] }, category);
      return { items, details: sourceHealth(raw, source).details ?? [] };
    }));
    const items: FeedItem[] = [];
    const details: SourceHealth[] = [];
    settled.forEach((result, index) => {
      const source = sources[index];
      if (result.status === "fulfilled") {
        items.push(...result.value.items);
        details.push(...result.value.details);
      } else details.push(healthDetail(source, "error"));
    });
    const health = summarizeHealth(details);
    const usable = details.some((detail) => detail.status !== "error");
    if (!usable) {
      const cached = recallGood<BriefResponse>(cacheKey);
      if (cached) return { ...cached.value, stale: true, health: summarizeHealth(
        (cached.value.health?.details ?? []).map((detail) => healthDetail(detail.id, "stale", detail.lastSuccessAt))) };
    }
    const result: BriefResponse = {
      schemaVersion: 2, top10: buildTop10(items, Date.now(), windowHours), fetchedAt: new Date().toISOString(),
      phase: phase as "primary" | "all", windowHours, health,
      ...(!usable ? { error: "News sources temporarily unavailable. Try again later." } : {}),
      ...(usable && !health.succeeded ? { stale: true } : {}),
    };
    if (health.succeeded) rememberGood(cacheKey, result);
    return result;
  }).catch((): BriefResponse => ({ schemaVersion: 2, top10: [], fetchedAt: new Date().toISOString(),
    phase: phase as "primary" | "all", windowHours, error: "Brief service is busy. Try again later.",
    health: summarizeHealth([healthDetail("brief", "error")]) }));
  return NextResponse.json(body, { headers: { "Cache-Control": body.stale || body.error
    ? "public, max-age=30, s-maxage=60" : "public, max-age=60, s-maxage=300, stale-while-revalidate=300" } });
}
