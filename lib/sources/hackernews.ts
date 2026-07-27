import { fetchJson } from "../fetch-helpers";
import type { FeedItem } from "../types";

interface AlgoliaHit {
  objectID: string;
  title: string | null;
  url: string | null;
  points: number | null;
  num_comments: number | null;
  author: string;
  created_at_i: number;
}

export async function fetchHackerNews({ q }: { q: string }, fresh = false): Promise<FeedItem[]> {
  const since = Math.floor(Date.now() / 1000) - 7 * 86400;
  const u =
    `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}` +
    `&tags=story&hitsPerPage=50&numericFilters=created_at_i>${since}`;
  const data = await fetchJson<{ hits: AlgoliaHit[] }>(u, { revalidate: fresh ? 0 : undefined });
  return data.hits
    .filter((h) => h.title)
    .map((h) => ({
      id: `hn:${h.objectID}`,
      source: "hackernews" as const,
      title: h.title as string,
      url: `https://news.ycombinator.com/item?id=${h.objectID}`,
      externalUrl: h.url?.startsWith("http") ? h.url : undefined,
      score: h.points ?? 0,
      comments: h.num_comments ?? 0,
      author: h.author,
      timestamp: new Date(h.created_at_i * 1000).toISOString(),
    }));
}
