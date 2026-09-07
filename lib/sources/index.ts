import type { FeedItem, SourceId } from "../types";
import { fetchBluesky } from "./bluesky";
import { fetchFourchan } from "./fourchan";
import { fetchGitHub } from "./github";
import { fetchHackerNews } from "./hackernews";
import { fetchPapers } from "./papers";
import { fetchReddit } from "./reddit";
import { fetchRss } from "./rss";
import { fetchYouTube } from "./youtube";
import { canonicalKey, sharedServerLoad } from "../server-cache";
import { sourceHealth } from "../source-health";

const splitList = (s: string | undefined) =>
  (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);

export const SOURCES: Record<
  SourceId,
  (params: Record<string, string>, fresh?: boolean) => Promise<FeedItem[]>
> = {
  reddit: (p, f) =>
    fetchReddit(
      {
        subs: p.subs,
        subsB: p.subsB || undefined,
        window: p.window === "week" ? "week" : "day",
        gates: [
          { subs: splitList(p.gateSubs), terms: splitList(p.gateTerms) },
          { subs: splitList(p.gate2Subs), terms: splitList(p.gate2Terms) },
        ],
      },
      f
    ),
  hackernews: (p, f) => fetchHackerNews({ q: p.q }, f),
  bluesky: (p, f) => fetchBluesky({ q: p.q }, f),
  fourchan: (p, f) =>
    fetchFourchan({ board: p.board, keywords: splitList(p.keywords), aiGate: p.aiGate === "1" }, f),
  rss: (p, f) =>
    fetchRss(
      { url: p.url || undefined, keywords: splitList(p.keywords), category: p.cat || undefined },
      f
    ),
  youtube: (p, f) =>
    fetchYouTube(
      { q: p.q || undefined, channel: p.channel || undefined, keywords: splitList(p.keywords) },
      f
    ),
  github: (p, f) => fetchGitHub({ q: p.q }, f),
  papers: (p, f) => fetchPapers({ keywords: splitList(p.keywords) }, f),
};

export function isSourceId(v: string): v is SourceId {
  return Object.hasOwn(SOURCES, v);
}

/** Public refresh and brief/column requests share one normalized five-minute load. */
export function loadSource(source: SourceId, params: Record<string, string>): Promise<FeedItem[]> {
  return sharedServerLoad(canonicalKey(`source:${source}`, params), async () => {
    const items = await SOURCES[source](params, false);
    sourceHealth(items, source); // stamp retrieval once, not each consumer/cache hit
    return items;
  });
}
