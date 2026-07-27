import { fetchJson, makeMatcher, stripHtml, truncate } from "../fetch-helpers";
import { AI_TERMS } from "../categories";
import type { FeedItem } from "../types";

interface CatalogThread {
  no: number;
  sub?: string;
  com?: string;
  replies?: number;
  time: number;
  last_modified?: number;
}

interface CatalogPage {
  page: number;
  threads?: CatalogThread[];
}

export async function fetchFourchan(
  {
    board,
    keywords,
    aiGate = false,
  }: {
    board: string;
    keywords: string[];
    aiGate?: boolean;
  },
  fresh = false
): Promise<FeedItem[]> {
  const pages = await fetchJson<CatalogPage[]>(`https://a.4cdn.org/${board}/catalog.json`, {
    revalidate: fresh ? 0 : undefined,
  });
  const threads = pages.flatMap((p) => p.threads ?? []);
  const matches = makeMatcher(keywords);
  const aiMatches = aiGate ? makeMatcher(AI_TERMS) : null;

  return threads
    .filter((t) => {
      const sub = t.sub ? stripHtml(t.sub) : "";
      const com = t.com ? stripHtml(t.com) : "";
      if (!matches(sub, com)) return false;
      // Vendor-name matches ("google", "nvidia") drag in unrelated generals —
      // gated categories additionally require the thread to be about AI.
      return aiMatches ? aiMatches(sub, com) : true;
    })
    .sort((a, b) => blendScore(b) - blendScore(a))
    .slice(0, 25)
    .map((t) => {
      const sub = t.sub ? stripHtml(t.sub) : "";
      const com = t.com ? stripHtml(t.com) : "";
      const title = sub || truncate(com, 100) || `Thread #${t.no}`;
      return {
        id: `4chan:${board}:${t.no}`,
        source: "fourchan" as const,
        title,
        url: `https://boards.4chan.org/${board}/thread/${t.no}`,
        score: t.replies ?? 0,
        comments: t.replies ?? 0,
        timestamp: new Date((t.last_modified ?? t.time) * 1000).toISOString(),
        excerpt: sub && com ? truncate(com, 280) : com.length > 100 ? truncate(com, 280) : undefined,
        sourceMeta: `/${board}/`,
      };
    });
}

/**
 * Pure reply-count sorting pins the same perennial generals to #1 forever;
 * decay by thread age so newer discussions can surface.
 */
function blendScore(t: CatalogThread): number {
  const ageHours = Math.max(0, (Date.now() / 1000 - t.time) / 3600);
  return ((t.replies ?? 0) + 1) * Math.exp(-ageHours / 48);
}
